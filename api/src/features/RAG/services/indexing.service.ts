/**
 * Parsed document → chunks in SQLite + vectors in Qdrant.
 *
 * Runs as its own job, in parallel with extraction and invisible to the user.
 * It never reads or writes documents.status — that field describes extraction
 * only. Success and failure are recorded on the job row, and "is this document
 * searchable" is answered by document_chunks, not by a status.
 *
 * Idempotent: both sides are cleared before anything is written, so re-running
 * it for the same document cannot double the index.
 */

import type Database from "better-sqlite3";
import { v5 as uuidv5 } from "uuid";
import type { DocumentRecord } from "../../document/models/document.model.js";
import { DOCUMENT_SQL } from "../../document/sqls/document.sql.js";
import { EMBED_MODEL, embed } from "../../extraction/llms/ollama.js";
import type {
  DocumentText,
  PageSpans,
} from "../../extraction/models/extraction.model.js";
import { DOCUMENT_TEXT_SQL } from "../../extraction/sql/documentText.sql.js";
import type { ParsedPage } from "../../parsing/types.js";
import { chunkPages } from "../ingestion/chunker.js";
import { CHUNKS_SQL } from "../sql/chunks.sql.js";
import { deleteDocumentPoints, upsertChunks } from "../vector/qdrant.js";

/**
 * Fixed namespace for point ids. SQLite ids are per tenant DB, so user 1's
 * chunk 42 and user 2's chunk 42 would overwrite each other in the shared
 * collection; uuidv5(`${userId}:${chunkId}`) cannot collide. Changing this
 * orphans every point already stored.
 */
const POINT_NAMESPACE = "6f1c2a9e-4b7d-4e3a-9c58-2d0f7a1b3e64";

export async function indexDocument(
  db: Database.Database,
  userId: number,
  documentId: number,
): Promise<{ chunks: number }> {
  const document = db.prepare(DOCUMENT_SQL.getById).get(documentId) as
    | DocumentRecord
    | undefined;
  // Deleted while the job sat in the queue — nothing to index, not a failure.
  if (!document) return { chunks: 0 };

  const parsedText = db
    .prepare(DOCUMENT_TEXT_SQL.getByDocumentId)
    .get(documentId) as DocumentText | undefined;
  // The only gate. Review status is irrelevant: passages come from parser text,
  // so a document is searchable as soon as it is parsed.
  if (!parsedText) throw new Error(`no parsed text for document ${documentId}`);

  const pages: ParsedPage[] = JSON.parse(parsedText.pages_json);
  const pageSpans: PageSpans[] = JSON.parse(parsedText.spans_json);
  const chunks = chunkPages(
    pages,
    new Map(pageSpans.map((spans) => [spans.page, spans])),
  );

  // Qdrant first: if it is down this throws before SQLite is touched, so the
  // job fails cleanly and leaves the previous index — if any — exactly as it was.
  await deleteDocumentPoints(userId, documentId);

  const insert = db.prepare(CHUNKS_SQL.insert);
  const chunkIds = db.transaction(() => {
    db.prepare(CHUNKS_SQL.deleteByDocument).run(documentId);
    return chunks.map((chunk) =>
      Number(
        insert.run(
          documentId,
          chunk.chunkIndex,
          chunk.page,
          chunk.text,
          chunk.charStart,
          chunk.charEnd,
          JSON.stringify(chunk.spanIds),
          JSON.stringify(chunk.boxes),
          chunk.tokenEstimate,
        ).lastInsertRowid,
      ),
    );
  })();

  try {
    const vectors = await embed(
      chunks.map((chunk) => chunk.text),
      "document",
    );

    // ponytail: one upsert per document. Fine to ~3k chunks (~25MB of JSON
    // against Qdrant's 32MB request cap); batch it if documents get that big.
    await upsertChunks(
      userId,
      chunks.map((chunk, i) => ({
        id: uuidv5(`${userId}:${chunkIds[i]}`, POINT_NAMESPACE),
        vector: vectors[i],
        payload: {
          chunk_id: chunkIds[i],
          document_id: documentId,
          schema_id: document.schema_id,
          page: chunk.page,
        },
      })),
    );
  } catch (error) {
    // Rows with no vectors behind them would read as "indexed" to anything
    // counting chunks. Leave nothing rather than a half-built index.
    db.prepare(CHUNKS_SQL.deleteByDocument).run(documentId);
    throw error;
  }

  db.prepare(CHUNKS_SQL.markEmbedded).run(EMBED_MODEL, documentId);
  return { chunks: chunks.length };
}
