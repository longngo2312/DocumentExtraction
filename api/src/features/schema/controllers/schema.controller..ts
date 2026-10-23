import { Request, Response } from "express";
import type {
  CreateSchemaBody,
  SchemaColumnInput,
  UpdateSchemaBody,
} from "../dtos/schema.dto.js";
import * as schemaService from "../services/schema.service..js";
import { SchemaError } from "../services/schema.service..js";

const DATA_TYPES = new Set(["text", "number", "date", "boolean", "enum"]);

/**
 * Columns arrive from the client, so check what extraction relies on: every
 * column named, names unique (results are keyed by them), a known type, and an
 * enum with something to choose from. Returns the first problem, or null.
 */
function columnsError(columns: unknown): string | null {
  if (!Array.isArray(columns)) return "Columns must be an array";
  const seen = new Set<string>();
  for (const col of columns as SchemaColumnInput[]) {
    const name = typeof col?.name === "string" ? col.name.trim() : "";
    if (!name) return "Every column needs a name";
    const key = name.toLowerCase();
    if (seen.has(key)) return `Column names must be unique: "${name}" is used twice`;
    seen.add(key);
    if (col.data_type !== undefined && !DATA_TYPES.has(col.data_type)) {
      return `Unknown data type for "${name}"`;
    }
    if (
      col.data_type === "enum" &&
      !(Array.isArray(col.enum_options) && col.enum_options.some((o) => String(o).trim()))
    ) {
      return `"${name}" is an enum but lists no options`;
    }
  }
  return null;
}

//get(/)
export function getAllSchemas(req: Request, res: Response) {
  try {
    const schemas = schemaService.getAllSchemas(req.user!.userId);
    res.json(schemas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch schemas" });
  }
}

//get(/:id) get schema details by id
export function getSchemaDetails(req: Request<{ id: string }>, res: Response) {
  try {
    const detail = schemaService.getSchemaDetail(
      req.user!.userId,
      req.params.id,
    );
    res.json(detail);
  } catch (error) {
    if (error instanceof SchemaError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to fetch schema" });
  }
}

//post(/) create schema
export function createSchema(
  req: Request<{}, {}, CreateSchemaBody>,
  res: Response,
) {
  const { name, columns } = req.body;

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  const invalid = columnsError(columns);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const created = schemaService.createSchema(req.user!.userId, req.body);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof SchemaError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create schema" });
  }
}

//update schema
export function updateSchema(
  req: Request<{ id: string }, {}, UpdateSchemaBody>,
  res: Response,
) {
  const { name, columns } = req.body;
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "Name cannot be empty" });
  }
  if (columns !== undefined) {
    const invalid = columnsError(columns);
    if (invalid) return res.status(400).json({ error: invalid });
  }

  try {
    const updated = schemaService.updateSchema(
      req.user!.userId,
      req.params.id,
      req.body,
    );
    res.json(updated);
  } catch (error) {
    if (error instanceof SchemaError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update schema" });
  }
}

export function deleteSchema(req: Request<{ id: string }>, res: Response) {
  try {
    schemaService.deleteSchema(req.user!.userId, req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof SchemaError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to delete schema" });
  }
}
