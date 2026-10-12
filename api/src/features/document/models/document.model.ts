//database record
export interface DocumentRecord {
  id: number;
  schema_id: number;
  filename: string;
  mime_type: string;
  storage_path: string;
  status:
    | "uploaded"
    | "processing"
    | "extracted"
    | "reviewed"
    | "indexed"
    | "failed";
  size_bytes: number;
  uploaded_at: string;
}

//listDocuments
export interface DocumentListItem extends DocumentRecord {
  schema_name: string;
}

export interface ExtractionJob {
  id: number;
  user_id: number;
  document_id: number;
  status: "queued" | "running" | "failed" | "done";
  attempts: number;
  max_attempts: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
