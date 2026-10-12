export const DOCUMENT_SUMMARY_SQL = {
  // key_findings/caveats arrive as JSON.stringify(string[]) — the service
  // boundary parses them back before anything reads them.
  upsert: `
        INSERT INTO document_summaries (
            document_id, overview, key_findings, caveats, model, input_chars, generated_at
        ) VALUES (?,?,?,?,?,?, datetime('now'))
        ON CONFLICT(document_id) DO UPDATE SET
            overview     = excluded.overview,
            key_findings = excluded.key_findings,
            caveats      = excluded.caveats,
            model        = excluded.model,
            input_chars  = excluded.input_chars,
            generated_at = datetime('now');
    `,

  getByDocumentId: `
        SELECT * FROM document_summaries WHERE document_id = ?;
    `,
};
