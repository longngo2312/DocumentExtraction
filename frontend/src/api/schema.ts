import type { DocumentSchema, SchemaDetail } from "../types";
import { apiFetch } from "./client";

export function createDocumentSchema(
  name: string,
  description: string,
  columns: unknown[],
) {
  return apiFetch("/schemas", {
    method: "POST",
    body: JSON.stringify({ name, description, columns }),
  });
}

export function getAllSchemas() {
  return apiFetch<DocumentSchema[]>("/schemas", {
    method: "GET",
  });
}

export function getSchema(id: number) {
  return apiFetch<SchemaDetail>(`/schemas/${id}`);
}

export function updateSchema(
  id: number,
  data: { name?: string; description?: string; columns?: unknown[] },
) {
  return apiFetch<DocumentSchema>(`/schemas/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteSchema(id: number) {
  return apiFetch<void>(`/schemas/${id}`, {
    method: "DELETE",
  });
}
