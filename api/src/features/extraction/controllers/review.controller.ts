import path from "path";
import type { Request, Response } from "express";
import * as documentService from "../../document/services/documents.services.js";
import { resolveStoragePath } from "../../document/utils/storage.util.js";
import type { ReviewEdit } from "../models/extraction.model.js";
import * as reviewService from "../services/review.service.js";

export function getReview(req: Request<{ id: string }>, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }

  const docId = Number(req.params.id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return res.status(400).json({ error: "A valid document id is required" });
  }

  try {
    const payload = reviewService.getReviewPayload(userId, docId);
    if (!payload) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load review data" });
  }
}

export function saveReview(req: Request<{ id: string }>, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }

  const docId = Number(req.params.id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return res.status(400).json({ error: "A valid document id is required" });
  }

  const edits = req.body.edits;
  if (!Array.isArray(edits)) {
    return res.status(400).json({ error: "edits array is required" });
  }

  try {
    reviewService.saveReview(userId, docId, edits as ReviewEdit[]);
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to save review" });
  }
}

export function getDocumentFile(req: Request<{ id: string }>, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }

  const docId = Number(req.params.id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return res.status(400).json({ error: "A valid document id is required" });
  }

  try {
    const document = documentService.getDocById(userId, docId);
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    const absolutePath = resolveStoragePath(document.storage_path);

    res.type(document.mime_type);
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(path.resolve(absolutePath), (err) => {
      if (err && !res.headersSent) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          res.status(404).json({ error: "File not found on disk" });
        } else {
          console.error(err);
          res.status(500).json({ error: "Failed to send file" });
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve file" });
  }
}