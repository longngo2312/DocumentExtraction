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

type Db = ReturnType<typeof getTenantDb>;

/** Schema names are UNIQUE per tenant; say so instead of failing with a 500. */
function rethrowDuplicateName(error: unknown, name: string | undefined): never {
  if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
    throw new SchemaError(409, `A schema named "${name?.trim()}" already exists.`);
  }
  throw error;
}

/** A column's stored fields, in the order both insert and update bind them. */
function columnValues(col: SchemaColumnInput, position: number) {
  return [
    col.name.trim(),
    col.description ?? null,
    col.data_type ?? "text",
    col.enum_options ? JSON.stringify(col.enum_options) : null,
    col.required ? 1 : 0,
    position,
  ];
}

function insertColumns(db: Db, schemaId: number, columns: SchemaColumnInput[]) {
  const insertColumn = db.prepare(SCHEMA_SQL.insertColumn);
  columns.forEach((col, i) => insertColumn.run(schemaId, ...columnValues(col, i)));
}

/**
 * Bring a schema's columns to `columns` while keeping the ids of the ones that
 * survive. Extracted values reference columns ON DELETE CASCADE, so replacing
 * every column — as this used to — erased every extracted and reviewed value
 * for the schema on any save. Now only a column the user removed takes its
 * values with it.
 */
export function syncColumns(db: Db, schemaId: number, columns: SchemaColumnInput[]) {
  const existing = new Set(
    (db.prepare(SCHEMA_SQL.getColumnIdsBySchemaId).all(schemaId) as { id: number }[]).map(
      (row) => row.id,
    ),
  );
  const kept = new Set(
    columns.map((col) => col.id).filter((id): id is number => existing.has(id as number)),
  );

  const remove = db.prepare(SCHEMA_SQL.deleteColumn);
  for (const id of existing) if (!kept.has(id)) remove.run(id, schemaId);

  const update = db.prepare(SCHEMA_SQL.updateColumn);
  const insert = db.prepare(SCHEMA_SQL.insertColumn);
  columns.forEach((col, i) => {
    // An id this schema doesn't own is treated as a new column, never moved.
    if (col.id !== undefined && kept.has(col.id)) {
      update.run(...columnValues(col, i), col.id, schemaId);
    } else {
      insert.run(schemaId, ...columnValues(col, i));
    }
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
    .prepare(SCHEMA_SQL.getColumnsBySchemaIdOrdered)
    .all(schemaId) as SchemaColumns[];

  return { ...schema, schemaColumns };
}

export function createSchema(userId: number, body: CreateSchemaBody) {
  const db = getTenantDb(userId);
  const insertSchema = db.prepare(SCHEMA_SQL.insertSchema);

  let schemaId: number;
  try {
    schemaId = db.transaction(() => {
      const { lastInsertRowid } = insertSchema.run(body.name.trim(), body.description);
      const id = Number(lastInsertRowid);
      insertColumns(db, id, body.columns);
      return id;
    })();
  } catch (error) {
    rethrowDuplicateName(error, body.name);
  }

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

  try {
    db.transaction(() => {
      db.prepare(SCHEMA_SQL.updateSchema).run(
        body.name?.trim() ?? null,
        body.description ?? null,
        schemaId,
      );
      if (body.columns !== undefined) {
        syncColumns(db, Number(schemaId), body.columns);
      }
    })();
  } catch (error) {
    rethrowDuplicateName(error, body.name);
  }

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
