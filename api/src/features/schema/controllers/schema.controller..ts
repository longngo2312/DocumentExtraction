import { Request, Response } from "express";
import type { CreateSchemaBody, UpdateSchemaBody } from "../dtos/schema.dto.js";
import * as schemaService from "../services/schema.service..js";
import { SchemaError } from "../services/schema.service..js";

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

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  if (!Array.isArray(columns)) {
    return res.status(400).json({ error: "Columns must be an array" });
  }

  try {
    const created = schemaService.createSchema(req.user!.userId, req.body);
    res.status(201).json(created);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create schema" });
  }
}

//update schema
export function updateSchema(
  req: Request<{ id: string }, {}, UpdateSchemaBody>,
  res: Response,
) {
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
