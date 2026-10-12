import { Request, Response } from "express";
import type { UploadBody } from "../dtos/document.dto.js";
import * as documentService from "../services/documents.services.js";
import { DocumentError } from "../utils/error.utils.js";
import { safeUnlink } from "../utils/storage.util.js";

//post(/) upload a document against a schema
export function uploadDocument(
  req: Request<{}, {}, UploadBody>,
  res: Response,
) {
  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }

  // Multipart text fields arrive as strings, so schema_id needs parsing.
  const schemaId = Number(req.body.schema_id);
  if (!Number.isInteger(schemaId) || schemaId <= 0) {
    safeUnlink(req.file.path);
    return res.status(400).json({ error: "A valid schema_id is required" });
  }

  try {
    const userId = req.user?.userId;
    if (!userId) {
      safeUnlink(req.file.path);
      return res.status(401).json({ error: "User authentication required" });
    }
    const created = documentService.createDocument(userId, req.file, schemaId);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof DocumentError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to upload document" });
  }
}

export function listDocuments(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }
  try {
    res.json(documentService.listDocuments(userId));
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to list documents" });
  }
}

//get(/:id) single document
export function getDocument(req: Request<{ id: string }>, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }

  const docId = Number(req.params.id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return res.status(400).json({ error: "A valid document id is required" });
  }

  try {
    const result = documentService.getDocById(userId, docId);
    // .get() returns undefined when nothing matches — without this the response
    // would be res.json(undefined), which Express turns into a 500.
    if (!result) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed getting the document" });
  }
}

//delete(/:id) remove the document row, its jobs, and its file
export function deleteDocument(req: Request<{ id: string }>, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }

  const docId = Number(req.params.id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return res.status(400).json({ error: "A valid document id is required" });
  }

  try {
    const deleted = documentService.deleteDocument(userId, docId);
    if (!deleted) {
      return res.status(404).json({ error: "Document not found" });
    }
    // 204 means no body, so send() rather than json().
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete the document" });
  }
}
