export const DOCUMENT_SQL = {
  schemaExists: `SELECT id FROM document_schemas WHERE id = ?;`,

  getDocuments: `
    SELECT documents.*, document_schemas.name AS schema_name 
      FROM documents 
      JOIN document_schemas ON document_schemas.id = documents.schema_id 
      ORDER BY documents.uploaded_at DESC, documents.id DESC;
  `,

  insertDocument: `
    INSERT INTO documents (schema_id, filename, mime_type, storage_path, size_bytes, status)
    VALUES (?, ?, ?, ?, ?, 'uploaded');
  `,

  // Internal lookups (read-back after insert, delete) — no join needed.
  getById: `SELECT * FROM documents WHERE id = ?;`,

  // Client-facing detail: same shape as getDocuments so the frontend sees
  // identical fields whether it reads a row from the list or on its own.
  getDocumentById: `
    SELECT documents.*, document_schemas.name AS schema_name
      FROM documents
      JOIN document_schemas ON document_schemas.id = documents.schema_id
      WHERE documents.id = ?;
  `,

  deleteById: `DELETE FROM documents WHERE id = ?;`,

  updateStatus: `UPDATE documents SET status = ? WHERE id = ?;`,
};

// Lives in the admin DB, not the tenant DB.
export const JOB_SQL = {
  insertJob: `
    INSERT INTO extraction_jobs (user_id, document_id, status)
    VALUES (?, ?, 'queued');
  `,

  // document_id is only unique within a tenant — every tenant DB numbers its
  // documents from 1 — so user_id is what stops this touching another user's jobs.
  deleteJobsByDocument: `
    DELETE FROM extraction_jobs WHERE user_id = ? AND document_id = ?;
  `,
};
