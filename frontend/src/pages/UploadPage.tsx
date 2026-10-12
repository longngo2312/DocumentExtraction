import { Box, Button, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import PageShell from "../components/layout/PageShell";
import FileDropZone from "../components/upload/FileDropZone";
import SchemaSelect from "../components/schema/SchemaSelect";
import UploadQueue from "../components/upload/UploadQueue";
import { useDocumentStore } from "../stores/documentStore";
import type { UploadItem } from "../types";
import { formatBytes } from "../utils/format";
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_BYTES,
  validateFile,
} from "../utils/upload";

function toUploadItem(file: File): UploadItem {
  const error = validateFile(file);
  return {
    id: crypto.randomUUID(),
    file,
    // Files that fail the local size check land in the queue already failed,
    // so the user sees why instead of the row silently disappearing.
    status: error ? "error" : "pending",
    error: error ?? undefined,
  };
}

export default function UploadPage() {
  const [schemaId, setSchemaId] = useState<number | "">("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const navigate = useNavigate();

  const pending = items.filter((item) => item.status === "pending");
  const uploadedCount = items.filter((item) => item.status === "done").length;
  const noSchema = schemaId === "";

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function handleFiles(files: File[]) {
    setItems((previous) => [...previous, ...files.map(toUploadItem)]);
  }

  function handleRemove(id: string) {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }

  function handleClearFinished() {
    setItems((previous) => previous.filter((item) => item.status !== "done"));
  }

  async function uploadOne(item: UploadItem, targetSchemaId: number) {
    patchItem(item.id, { status: "uploading", error: undefined });
    try {
      await addDocument(item.file, targetSchemaId);
      patchItem(item.id, { status: "done" });
    } catch (error) {
      patchItem(item.id, {
        status: "error",
        error: error instanceof ApiError ? error.message : "Upload failed",
      });
    }
  }

  async function handleUploadAll() {
    if (noSchema || uploading) return;

    setUploading(true);
    // The queue can't shift underneath this loop — the drop zone, the schema
    // select and the per-row buttons are all disabled while it runs.
    for (const item of pending) {
      await uploadOne(item, schemaId);
    }
    setUploading(false);
  }

  async function handleRetry(item: UploadItem) {
    if (noSchema || uploading) return;

    setUploading(true);
    await uploadOne(item, schemaId);
    setUploading(false);
  }

  return (
    <PageShell
      title="Upload"
      subtitle="Pick a schema, then add the documents to extract."
    >
      <Stack spacing={3}>
        <SchemaSelect
          disable={uploading}
          onChange={setSchemaId}
          value={schemaId}
        />

        <Box>
          <FileDropZone
            onFiles={handleFiles}
            disabled={noSchema || uploading}
            accept={ACCEPTED_FILE_TYPES}
            hint={`PDF, Word, Excel, PowerPoint, text or image — up to ${formatBytes(MAX_FILE_BYTES)} each`}
          />

          {noSchema && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1, display: "block" }}
            >
              Select a schema before uploading
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Button
            variant="contained"
            disabled={noSchema || uploading || pending.length === 0}
            onClick={handleUploadAll}
          >
            {uploading
              ? "Uploading…"
              : `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}`}
          </Button>

          {uploadedCount > 0 && !uploading && (
            <Button variant="outlined" onClick={() => navigate("/documents")}>
              View documents
            </Button>
          )}
        </Box>
      </Stack>

      {/* Status changes here are the only feedback that an upload progressed,
          so they need to reach a screen reader too. */}
      <Box aria-live="polite" aria-atomic="false">
        <UploadQueue
          items={items}
          onRetry={handleRetry}
          onRemove={handleRemove}
          onClearFinished={handleClearFinished}
        />
      </Box>
    </PageShell>
  );
}
