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
};
