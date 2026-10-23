/**
 * The only door to Qdrant.
 *
 * One collection holds every user's vectors, so a query without a tenant filter
 * reads everyone's documents — that is a data leak, not a bug. The raw client is
 * deliberately not exported: every read and delete goes through tenantFilter(),
 * and every write stamps `tenant` itself. A module that imports QdrantClient
 * directly bypasses all of this.
 *
 * Qdrant holds vectors, ids and a five-field payload only. Text and provenance
 * live in SQLite, so the index can always be rebuilt from it and two copies of
 * provenance can never drift.
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBED_DIMENSIONS } from "../../extraction/llms/ollama.js";

const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION = "document_chunks";

/**
 * Built on first use, not at import. The constructor fires a version check that
 * warns when Qdrant is unreachable — and Qdrant being down is a supported state:
 * the API boots and extraction runs without it. Lazy, the check only happens
 * once something actually needs search.
 */
let client: QdrantClient | null = null;
function qdrant(): QdrantClient {
  return (client ??= new QdrantClient({ url: QDRANT_URL }));
}

export interface ChunkPayload {
  chunk_id: number;
  document_id: number;
  schema_id: number;
  page: number;
}

export interface ChunkPoint {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

export interface ChunkHit {
  /** Cosine similarity — higher is closer. Never call this a distance. */
  score: number;
  payload: ChunkPayload;
}

function tenant(userId: number): string {
  return `user_${userId}`;
}

function tenantFilter(userId: number, extra: object[] = []) {
  return { must: [{ key: "tenant", match: { value: tenant(userId) } }, ...extra] };
}

/** Bare "fetch failed" says nothing about which of three processes is down. */
export class QdrantUnavailableError extends Error {
  constructor() {
    super(
      `Cannot reach Qdrant at ${QDRANT_URL}. Start it with \`docker start qdrant\`.`,
    );
  }
}

async function withQdrant<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    const message = (error as Error)?.message ?? "";
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      throw new QdrantUnavailableError();
    }
    throw error;
  }
}

let ready: Promise<void> | null = null;

/**
 * Create the collection and its payload indexes if missing. Lazy rather than at
 * startup, so the API still boots — and extraction still runs — when Qdrant is
 * down. `size` and `distance` are permanent once the collection exists.
 */
function ensureCollection(): Promise<void> {
  ready ??= withQdrant(async () => {
    const { exists } = await qdrant().collectionExists(COLLECTION);
    if (exists) return;
    await qdrant().createCollection(COLLECTION, {
      vectors: { size: EMBED_DIMENSIONS, distance: "Cosine" },
    });
    // Without these every filtered search is a full scan of every tenant.
    await qdrant().createPayloadIndex(COLLECTION, {
      field_name: "tenant",
      field_schema: { type: "keyword", is_tenant: true },
    });
    await qdrant().createPayloadIndex(COLLECTION, {
      field_name: "document_id",
      field_schema: "integer",
    });
  }).catch((error) => {
    ready = null; // retry on the next call instead of caching the failure
    throw error;
  });
  return ready;
}

/** Cheap liveness probe for the query page's empty states. */
export async function isQdrantUp(): Promise<boolean> {
  try {
    await ensureCollection();
    return true;
  } catch {
    return false;
  }
}

export async function upsertChunks(
  userId: number,
  points: ChunkPoint[],
): Promise<void> {
  if (points.length === 0) return;
  await ensureCollection();
  await withQdrant(() =>
    qdrant().upsert(COLLECTION, {
      // Without wait the job reports done before the points are searchable.
      wait: true,
      points: points.map((point) => ({
        ...point,
        payload: { ...point.payload, tenant: tenant(userId) },
      })),
    }),
  );
}

export async function deleteDocumentPoints(
  userId: number,
  documentId: number,
): Promise<void> {
  await ensureCollection();
  await withQdrant(() =>
    qdrant().delete(COLLECTION, {
      wait: true,
      filter: tenantFilter(userId, [
        { key: "document_id", match: { value: documentId } },
      ]),
    }),
  );
}

export async function searchChunks(
  userId: number,
  vector: number[],
  options: { limit: number; scoreThreshold: number; documentId?: number },
): Promise<ChunkHit[]> {
  await ensureCollection();
  const scope = options.documentId
    ? [{ key: "document_id", match: { value: options.documentId } }]
    : [];

  const result = await withQdrant(() =>
    qdrant().query(COLLECTION, {
      query: vector,
      filter: tenantFilter(userId, scope),
      limit: options.limit,
      score_threshold: options.scoreThreshold,
      with_payload: true,
    }),
  );

  return result.points.map((point) => ({
    score: point.score,
    payload: point.payload as unknown as ChunkPayload,
  }));
}
