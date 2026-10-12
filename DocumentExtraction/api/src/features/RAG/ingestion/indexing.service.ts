/**
 * Reviewed document → chunks in SQLite + vectors in Qdrant. See docs/phase6-rag,
 * Stage 4. Every step is safe to re-run: re-indexing deletes both sides first.
 */

import type Database from "better-sqlite3";
import { v5 as uuidv5 } from "uuid";
import type { DocumentRecord } from "../../document/models/document.model.js";
import { DOCUMENT_SQL } from "../../document/sqls/document.sql.js";
import type {
  DocumentText,
  PageSpans,
} from "../../extraction/models/extraction.model.js";
import { DOCUMENT_TEXT_SQL } from "../../extraction/sql/documentText.sql.js";
import type { ParsedPage } from "../../parsing/types.js";
import { CHUNKS_SQL } from "../sql/chunks.sql.js";
import { deleteDocumentPoints, upsertChunks } from "../vector/qdrant.js";
import { chunkPages } from "./chunker.js";
import { EMBED_MODEL, embed } from "./embedder.js";

/**
 * Fixed namespace for point ids. SQLite ids are per tenant DB, so user 1's
 * chunk 42 and user 2's chunk 42 would overwrite each other in the shared
 * collection; uuidv5(`${userId}:${chunkId}`) cannot collide. Never change it.
 */
const POINT_NAMESPACE = "6f1c2a9e-4b7d-4e3a-9c58-2d0f7a1b3e64";

export async function indexDocument(
  db: Database.Database,
  userId: number,
  documentId: number,
): Promise<{ chunks: number }> {
  // The review gate lives here, not at each call site. 'indexed' is allowed
  // too so a re-index works.
  const document = db.prepare(DOCUMENT_SQL.getById).get(documentId) as
    | DocumentRecord
    | undefined;
  if (!document || (document.status !== "reviewed" && document.status !== "indexed")) {
    return { chunks: 0 };
  }

  const parsedText = db
    .prepare(DOCUMENT_TEXT_SQL.getByDocumentId)
    .get(documentId) as DocumentText | undefined;
  if (!parsedText) throw new Error(`no parsed text for document ${documentId}`);

  const pages: ParsedPage[] = JSON.parse(parsedText.pages_json);
  const pageSpans: PageSpans[] = JSON.parse(parsedText.spans_json);
  const spansByPage = new Map(pageSpans.map((p) => [p.page, p]));

  // Delete first, both sides — otherwise old chunks stay retrievable forever.
  // Drop back to 'reviewed' so a failure below never leaves a stale 'indexed'.
  db.prepare(DOCUMENT_SQL.updateStatus).run("reviewed", documentId);
  await deleteDocumentPoints(userId, documentId);

  const chunks = chunkPages(pages, spansByPage);

  const insert = db.prepare(CHUNKS_SQL.insert);
  const chunkIds = db.transaction(() => {
    db.prepare(CHUNKS_SQL.deleteByDocument).run(documentId);
    return chunks.map(
      (c) =>
        insert.run(
          documentId,
          c.chunkIndex,
          c.page,
          c.text,
          c.charStart,
          c.charEnd,
          JSON.stringify(c.spanIds),
          JSON.stringify(c.boxes),
          c.tokenEstimate,
        ).lastInsertRowid as number,
    );
  })();

  const vectors = await embed(chunks.map((c) => c.text));

  await upsertChunks(
    userId,
    chunks.map((c, i) => ({
      id: uuidv5(`${userId}:${chunkIds[i]}`, POINT_NAMESPACE),
      vector: vectors[i],
      payload: {
        chunk_id: Number(chunkIds[i]),
        document_id: documentId,
        schema_id: document.schema_id,
        page: c.page,
      },
    })),
  );

  db.prepare(CHUNKS_SQL.markEmbedded).run(EMBED_MODEL, documentId);
  db.prepare(DOCUMENT_SQL.updateStatus).run("indexed", documentId);

  return { chunks: chunks.length };
}
