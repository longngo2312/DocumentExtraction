/// <reference types="node" />
import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// api/src/features/document/utils -> api/storage/uploads
const UPLOADS_ROOT = path.join(__dirname, "../../../../storage/uploads");

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function userUploadDir(userId: number): string {
  const dir = path.join(UPLOADS_ROOT, `user_${userId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Absolute path -> the portable value we persist, e.g. "user_4/c8ec….pdf".
 * Forward slashes so a DB written on Windows still resolves elsewhere.
 */
export function toStoragePath(absolutePath: string): string {
  return path.relative(UPLOADS_ROOT, absolutePath).split(path.sep).join("/");
}

/** Persisted value -> absolute path on this machine. */
export function resolveStoragePath(storagePath: string): string {
  return path.join(UPLOADS_ROOT, storagePath);
}

/** Idempotent — deleting an already-missing file is not an error. */
export function safeUnlink(storagePath: string) {
  try {
    fs.unlinkSync(storagePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    cb(null, userUploadDir(req.user!.userId));
  },
  filename(_req, file, cb) {
    // Server-generated name; the original is kept in the DB for display only.
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});
