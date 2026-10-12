import type {
  DocumentListItem,
  ReviewEdit,
  ReviewPayload,
  UploadResponse,
} from "../types";
import { apiFetch, apiFetchBlob } from "./client";

export function uploadDocument(file: File, schemaId: number) {
  const formData = new FormData();
  formData.append("file", file);
  // Multipart fields are text — the API parses schema_id back to a number.
  formData.append("schema_id", String(schemaId));

  // No headers set here on purpose: apiFetch omits Content-Type for FormData so
  // the browser can add the multipart boundary itself.
  return apiFetch<UploadResponse>("/documents", {
    method: "POST",
    body: formData,
  });
}

export function getDocuments() {
  return apiFetch<DocumentListItem[]>("/documents");
}

export function getDocument(id: number) {
  return apiFetch<DocumentListItem>(`/documents/${id}`);
}

export function deleteDocument(id: number) {
  return apiFetch<void>(`/documents/${id}`, {
    method: "DELETE",
  });
}

/** Document record, parsed page text and extracted fields in one call. */
export function getReview(id: number) {
  return apiFetch<ReviewPayload>(`/documents/${id}/review`);
}

/**
 * Batch save. The server derives each review_status by comparing `value` against
 * llm_value, then flips the document to "reviewed" — so this is called once, on
 * submit, not per row.
 */
export function saveReview(id: number, edits: ReviewEdit[]) {
  return apiFetch<{ ok: true }>(`/documents/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ edits }),
  });
}

/** The raw upload. Blob rather than a URL because the route needs a Bearer header. */
export function getDocumentFile(id: number) {
  return apiFetchBlob(`/documents/${id}/file`);
}
