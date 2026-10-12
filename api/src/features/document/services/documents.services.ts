import adminDB from "../../../db/adminDB.js";
import { getTenantDb } from "../../../db/tenantDb.js";
import { notifyWorker } from "../../extraction/worker.js";
import type { UploadResponse } from "../dtos/document.dto.js";
import type {
  DocumentListItem,
  DocumentRecord,
} from "../models/document.model.js";
import { DOCUMENT_SQL, JOB_SQL } from "../sqls/document.sql.js";
import { DocumentError } from "../utils/error.utils.js";
import {
  resolveStoragePath,
  safeUnlink,
  toStoragePath,
} from "../utils/storage.util.js";

export function createDocument(
  userId: number,
  file: Express.Multer.File,
  schemaId: number,
): UploadResponse {
  const db = getTenantDb(userId);

  // Multer has already written the file by the time we get here, so every
  // failure path below has to clean it up or we leak a file on disk.
  const schema = db.prepare(DOCUMENT_SQL.schemaExists).get(schemaId);
  if (!schema) {
    safeUnlink(file.path);
    throw new DocumentError(404, "Schema not found");
  }

  const { lastInsertRowid } = db
    .prepare(DOCUMENT_SQL.insertDocument)
    .run(
      schemaId,
      file.originalname,
      file.mimetype,
      toStoragePath(file.path),
      file.size,
    );

  const documentId = Number(lastInsertRowid);
  let jobId: number;
  try {
    const job = adminDB.prepare(JOB_SQL.insertJob).run(userId, documentId);
    jobId = Number(job.lastInsertRowid);
  } catch (error) {
    db.prepare(DOCUMENT_SQL.deleteById).run(documentId);
    safeUnlink(file.path);
    throw error;
  }

  const document = db
    .prepare(DOCUMENT_SQL.getById)
    .get(documentId) as DocumentRecord;

  notifyWorker();
  return { document, jobId };
}

export function listDocuments(userId: number): DocumentListItem[] {
  const db = getTenantDb(userId);
  return db.prepare(DOCUMENT_SQL.getDocuments).all() as DocumentListItem[];
}

export function getDocById(
  userId: number,
  id: number,
): DocumentListItem | undefined {
  const db = getTenantDb(userId);
  return db.prepare(DOCUMENT_SQL.getDocumentById).get(id) as
    | DocumentListItem
    | undefined;
}

/** Returns false when the document does not exist, so the caller can 404. */
export function deleteDocument(userId: number, id: number): boolean {
  const db = getTenantDb(userId);

  // Fetch first — storage_path is the only pointer to the file on disk.
  const document = db.prepare(DOCUMENT_SQL.getById).get(id) as
    | DocumentRecord
    | undefined;
  if (!document) return false;

  // DB rows first, file last. If the unlink fails we leak an invisible file;
  // the reverse order would leave a row pointing at a file that is gone, which
  // keeps showing up in the list and 500s on every download.
  db.prepare(DOCUMENT_SQL.deleteById).run(id);
  adminDB.prepare(JOB_SQL.deleteJobsByDocument).run(userId, id);
  safeUnlink(resolveStoragePath(document.storage_path));

  return true;
}
