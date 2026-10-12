import type { DocumentRecord } from "../models/document.model.js";

// Multipart text fields always arrive as strings, never numbers.
export interface UploadBody {
  schema_id: string;
}

export interface ListQuery {
  schema_id?: string;
  status?: string;
}

export interface UploadResponse {
  document: DocumentRecord;
  jobId: number;
}

export interface getDocument {
  document_id: number;
}
