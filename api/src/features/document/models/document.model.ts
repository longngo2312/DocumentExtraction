//database record
export interface DocumentRecord {
  id: number;
  schema_id: number;
  filename: string;
  mime_type: string;
  storage_path: string;
  // Extraction's track only. Whether a document is searchable is RAG state,
  // which lives on its index job and in document_chunks — never here.
  status:
    | "uploaded"
    | "processing"
    | "extracted"
    | "reviewed"
    | "failed";
  size_bytes: number;
  uploaded_at: string;
}

//listDocuments
export interface DocumentListItem extends DocumentRecord {
  schema_name: string;
}

export type JobType = "parse" | "extract" | "index";

export interface ExtractionJob {
  id: number;
  user_id: number;
  document_id: number;
  job_type: JobType;
  status: "queued" | "running" | "failed" | "done";
  attempts: number;
  max_attempts: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
