export const CHUNKS_SQL = {
  insert: `
        INSERT INTO document_chunks
            (document_id, chunk_index, page, text, char_start, char_end, span_ids, boxes, token_estimate)
        VALUES (?,?,?,?,?,?,?,?,?);
    `,

  // Called before every re-index.
  deleteByDocument: `DELETE FROM document_chunks WHERE document_id = ?;`,

  markEmbedded: `
        UPDATE document_chunks SET embed_model = ?, embedded_at = datetime('now')
        WHERE document_id = ?;
    `,

  // Hydrates Qdrant hits. The id list arrives as one JSON array bound to a
  // single placeholder — json_each turns it into rows, so there is no
  // hand-built "?,?,?" list to get wrong. Joined for the filename, which the
  // Qdrant payload deliberately does not carry: a rename would leave it stale.
  getByIds: `
        SELECT c.id, c.document_id, c.page, c.text, c.char_start, c.char_end,
               c.boxes, d.filename
          FROM document_chunks c
          JOIN documents d ON d.id = c.document_id
         WHERE c.id IN (SELECT value FROM json_each(?));
    `,

  countByDocument: `
        SELECT COUNT(*) AS n FROM document_chunks
         WHERE document_id = ? AND embedded_at IS NOT NULL;
    `,

  // A document counts as searchable once its chunks are embedded — rows that
  // were inserted but never made it to Qdrant do not.
  countSearchableDocuments: `
        SELECT COUNT(DISTINCT document_id) AS n FROM document_chunks
         WHERE embedded_at IS NOT NULL;
    `,

  // Parsed but not searchable: uploaded before RAG existed, or whose index job
  // failed. A document whose every page is too short to chunk also lands here
  // and stays — there is nothing in it to search.
  unindexedDocuments: `
        SELECT t.document_id FROM parsedDocumentText t
         WHERE NOT EXISTS (
           SELECT 1 FROM document_chunks c
            WHERE c.document_id = t.document_id AND c.embedded_at IS NOT NULL
         );
    `,
};
