import { getTenantDb } from "../../../db/tenantDb.js";
import type {
  CreateSchemaBody,
  SchemaColumnInput,
  UpdateSchemaBody,
} from "../dtos/schema.dto.js";
import type { DocumentSchema, SchemaColumns } from "../models/schema.model.js";
import { SCHEMA_SQL } from "../sqls/schema.sql.js";

export class SchemaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function insertColumns(
  db: ReturnType<typeof getTenantDb>,
  schemaId: number,
  columns: SchemaColumnInput[],
) {
  const insertColumn = db.prepare(SCHEMA_SQL.insertColumn);
  columns.forEach((col, i) => {
    insertColumn.run(
      schemaId,
      col.name,
      col.description ?? null,
      col.data_type ?? "text",
      col.enum_options ? JSON.stringify(col.enum_options) : null,
      col.required ? 1 : 0,
      i,
    );
  });
}

export function getAllSchemas(userId: number) {
  const db = getTenantDb(userId);
  return db.prepare(SCHEMA_SQL.listWithColumnCount).all();
}

export function getSchemaDetail(userId: number, schemaId: string) {
  const db = getTenantDb(userId);
  const schema = db.prepare(SCHEMA_SQL.getById).get(schemaId) as
    | DocumentSchema
    | undefined;

  if (!schema) {
    throw new SchemaError(404, "Schema Not Found");
  }

  const schemaColumns = db
    .prepare(SCHEMA_SQL.getColumnsBySchemaId)
    .all(schemaId) as SchemaColumns[];

  return { ...schema, schemaColumns };
}

export function createSchema(userId: number, body: CreateSchemaBody) {
  const db = getTenantDb(userId);
  const insertSchema = db.prepare(SCHEMA_SQL.insertSchema);

  const schemaId = db.transaction(() => {
    const { lastInsertRowid } = insertSchema.run(body.name, body.description);
    const id = Number(lastInsertRowid);
    insertColumns(db, id, body.columns);
    return id;
  })();

  return db.prepare(SCHEMA_SQL.getWithColumnCountById).get(schemaId);
}

export function updateSchema(
  userId: number,
  schemaId: string,
  body: UpdateSchemaBody,
) {
  const db = getTenantDb(userId);

  const existing = db.prepare(SCHEMA_SQL.getById).get(schemaId);
  if (!existing) {
    throw new SchemaError(404, "Schema not found");
  }

  db.transaction(() => {
    db.prepare(SCHEMA_SQL.updateSchema).run(
      body.name ?? null,
      body.description ?? null,
      schemaId,
    );
    if (body.columns !== undefined) {
      db.prepare(SCHEMA_SQL.deleteColumnsBySchemaId).run(schemaId);
      insertColumns(db, Number(schemaId), body.columns);
    }
  })();

  const schema = db.prepare(SCHEMA_SQL.getById).get(schemaId) as DocumentSchema;
  const columns = db
    .prepare(SCHEMA_SQL.getColumnsBySchemaIdOrdered)
    .all(schemaId) as SchemaColumns[];

  return { ...schema, columns };
}

export function deleteSchema(userId: number, schemaId: string) {
  const db = getTenantDb(userId);
  const existing = db.prepare(SCHEMA_SQL.getById).get(schemaId);
  if (!existing) {
    throw new SchemaError(404, "Schema not found");
  }
  db.prepare(SCHEMA_SQL.deleteSchemaById).run(schemaId);
}
