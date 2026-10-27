/**
 * search_passages: question → the k nearest chunks, hydrated from SQLite.
 *
 * Qdrant decides the order and SQLite supplies the content. A hit with no row
 * behind it is a stale point — its document was deleted while Qdrant was
 * down — so it is skipped, which is what makes a best-effort delete safe.
 */

import type Database from "better-sqlite3";
import { embed } from "../../extraction/llms/ollama.js";
import type { NormalizedBox } from "../../parsing/types.js";
import type { Source } from "../models/rag.model.js";
import { CHUNKS_SQL } from "../sql/chunks.sql.js";
import { searchChunks } from "../vector/qdrant.js";

/** Passages per question. Five of ~300 tokens each leaves the 8192 window room. */
const TOP_K = 5;

/**
 * Cosine floor. Below it a hit is the nearest thing in the corpus, not a match,
 * and passing it on invites the model to answer from noise. Lower leaks
 * irrelevant passages; higher refuses more often.
 */
const SCORE_THRESHOLD = 0.4;

interface ChunkRow {
  id: number;
  document_id: number;
  page: number;
  text: string;
  char_start: number;
  char_end: number;
  boxes: string | null;
  filename: string;
}

export async function searchPassages(
  db: Database.Database,
  userId: number,
  query: string,
  documentId?: number,
): Promise<Source[]> {
  const [vector] = await embed([query], "query");
  const hits = await searchChunks(userId, vector, {
    limit: TOP_K,
    scoreThreshold: SCORE_THRESHOLD,
    documentId,
  });
  if (hits.length === 0) return [];

  const rows = db
    .prepare(CHUNKS_SQL.getByIds)
    .all(JSON.stringify(hits.map((hit) => hit.payload.chunk_id))) as ChunkRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Walk the hits, not the rows: SQL returns them in id order, and the order
  // that matters is Qdrant's.
  const sources: Source[] = [];
  for (const hit of hits) {
    const row = byId.get(hit.payload.chunk_id);
    if (!row) {
      console.warn(
        `[rag] stale point for chunk ${hit.payload.chunk_id} (document ${hit.payload.document_id}) — skipped`,
      );
      continue;
    }

    const boxes = row.boxes ? (JSON.parse(row.boxes) as NormalizedBox[]) : [];
    sources.push({
      kind: "passage",
      documentId: row.document_id,
      filename: row.filename,
      page: row.page,
      text: row.text,
      quote: row.text,
      charStart: row.char_start,
      charEnd: row.char_end,
      // An empty list means "no geometry" (office, plain text). Null says that
      // explicitly and routes the viewer to its offset-based highlight.
      boxes: boxes.length > 0 ? boxes : null,
    });
  }
  return sources;
}
