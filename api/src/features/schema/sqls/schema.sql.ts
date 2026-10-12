export const SCHEMA_SQL = {
  listWithColumnCount: `
    SELECT document_schemas.*, COUNT(schema_columns.id) AS column_count
    FROM document_schemas
    LEFT JOIN schema_columns ON document_schemas.id = schema_columns.schema_id
    GROUP BY document_schemas.id
    ORDER BY document_schemas.created_at DESC;
  `,

  getById: `SELECT * FROM document_schemas WHERE id = ?;`,

  getWithColumnCountById: `
    SELECT document_schemas.*, COUNT(schema_columns.id) AS column_count
    FROM document_schemas
    LEFT JOIN schema_columns ON document_schemas.id = schema_columns.schema_id
    WHERE document_schemas.id = ?
    GROUP BY document_schemas.id;
  `,

  getColumnsBySchemaId: `SELECT * FROM schema_columns WHERE schema_id = ?;`,

  getColumnsBySchemaIdOrdered: `
    SELECT * FROM schema_columns WHERE schema_id = ? ORDER BY position;
  `,

  insertSchema: `INSERT INTO document_schemas (name, description) VALUES (?, ?);`,

  insertColumn: `
    INSERT INTO schema_columns
      (schema_id, name, description, data_type, enum_options, required, position)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `,

  updateSchema: `
    UPDATE document_schemas
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        updated_at = datetime('now')
    WHERE id = ?;
  `,

  deleteColumnsBySchemaId: `DELETE FROM schema_columns WHERE schema_id = ?;`,

  deleteSchemaById: `DELETE FROM document_schemas WHERE id = ?;`,
};
