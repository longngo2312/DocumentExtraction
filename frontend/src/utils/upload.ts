import { formatBytes } from "./format";

/** Mirrors MAX_FILE_BYTES in api/src/features/document/utils/storage.util.ts. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_FILE_TYPES = [
  // documents
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
  // spreadsheets
  ".xls",
  ".xlsx",
  ".csv",
  // presentations
  ".ppt",
  ".pptx",
  // scans / images
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
].join(",");

/**
 * Returns an error message, or null when the file is fine. Checking the size
 * here saves a round trip that multer would only reject with a 400 anyway.
 */
export function validateFile(file: File): string | null {
  if (file.size === 0) return "File is empty";
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (max ${formatBytes(MAX_FILE_BYTES)})`;
  }
  return null;
}
