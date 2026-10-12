/**
 * The only door to Qdrant. See docs/phase6-rag, Stage 0.
 *
 * One collection holds every user's vectors, so a query without a tenant filter
 * reads everyone's documents. The raw client is deliberately not exported:
 * every call goes through tenantFilter() or stamps `tenant` on the payload.
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBED_DIMENSIONS } from "../ingestion/embedder.js";

const QDRANT_URL = "http://localhost:6333";
const COLLECTION = "document_chunks";

const client = new QdrantClient({ url: QDRANT_URL });

export interface ChunkPoint {
  id: string;
  vector: number[];
  payload: {
    chunk_id: number;
    document_id: number;
    schema_id: number;
    page: number;
  };
}

function tenant(userId: number): string {
  return `user_${userId}`;
}

function tenantFilter(userId: number, extra: object[] = []) {
  return { must: [{ key: "tenant", match: { value: tenant(userId) } }, ...extra] };
}

/** Bare "fetch failed" in the document grid says nothing — name the service. */
async function withQdrant<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    if ((error as Error)?.message?.includes("fetch failed")) {
      throw new Error(
        `Cannot reach Qdrant at ${QDRANT_URL}. Start it with \`docker start qdrant\`.`,
      );
    }
    throw error;
  }
}

let ready: Promise<void> | null = null;

/**
 * Create the collection and its payload indexes if missing. Lazy rather than at
 * startup, so the API still boots when Qdrant is down. `size` and `distance`
 * are permanent once created.
 */
function ensureCollection(): Promise<void> {
  ready ??= withQdrant(async () => {
    const { exists } = await client.collectionExists(COLLECTION);
    if (exists) return;
    await client.createCollection(COLLECTION, {
      vectors: { size: EMBED_DIMENSIONS, distance: "Cosine" },
    });
    await client.createPayloadIndex(COLLECTION, {
      field_name: "tenant",
      field_schema: { type: "keyword", is_tenant: true },
    });
    await client.createPayloadIndex(COLLECTION, {
      field_name: "document_id",
      field_schema: "integer",
    });
  }).catch((error) => {
    ready = null; // retry on the next call instead of caching the failure
    throw error;
  });
  return ready;
}

export async function upsertChunks(userId: number, points: ChunkPoint[]) {
  if (points.length === 0) return;
  await ensureCollection();
  await withQdrant(() =>
    client.upsert(COLLECTION, {
      // Without wait the document flips to 'indexed' before it is searchable.
      wait: true,
      points: points.map((p) => ({
        ...p,
        payload: { ...p.payload, tenant: tenant(userId) },
      })),
    }),
  );
}

export async function deleteDocumentPoints(userId: number, documentId: number) {
  await ensureCollection();
  await withQdrant(() =>
    client.delete(COLLECTION, {
      wait: true,
      filter: tenantFilter(userId, [{ key: "document_id", match: { value: documentId } }]),
    }),
  );
}
