/**
 * Reads the summaries the system already wrote for each document.
 *
 * We need this because "summarize the document I just uploaded" asks about a
 * whole document, and finding five matching passages is the wrong tool for it.
 * The summary was written when the document was extracted, from the document
 * itself, so answering from it invents nothing.
 */
export const OVERVIEW_SQL = {
  /** Newest first, so the first row is "the document I just uploaded". */
  listWithSummary: `
        SELECT d.id, d.filename
          FROM documents d
          JOIN document_summaries s ON s.document_id = d.id
         ORDER BY d.uploaded_at DESC, d.id DESC;
    `,

  byDocument: `
        SELECT d.filename, s.overview, s.key_findings, s.caveats
          FROM document_summaries s
          JOIN documents d ON d.id = s.document_id
         WHERE s.document_id = ?;
    `,
};
