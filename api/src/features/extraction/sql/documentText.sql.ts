export const DOCUMENT_TEXT_SQL = {
  upsert: `
        INSERT INTO parsedDocumentText (document_id, text, pages_json, spans_json, page_count, char_count, method, parsed_at)
        VALUES (?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(document_id) DO UPDATE SET
            text = excluded.text,
            pages_json = excluded.pages_json,
            spans_json = excluded.spans_json,
            page_count = excluded.page_count,
            char_count = excluded.char_count,
            method = excluded.method,
            parsed_at = excluded.parsed_at;
    `,

  // Extraction only — this is the one that carries spans_json.
  getByDocumentId: `
        SELECT * FROM parsedDocumentText WHERE document_id = ?;
    `,

  // The review payload. Deliberately not SELECT *: a 20-page PDF is ~20k spans,
  // roughly 1MB of JSON, and the client draws from server-resolved boxes now, so
  // shipping the spans to the browser buys nothing.
  getPagesForReview: `
        SELECT document_id, text, pages_json, page_count, char_count, method, parsed_at
        FROM parsedDocumentText WHERE document_id = ?;
    `,
};
