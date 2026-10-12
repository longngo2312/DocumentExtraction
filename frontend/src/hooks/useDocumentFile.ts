import { useEffect, useState } from "react";
import { getDocumentFile } from "../api/documents";

interface FetchResult {
  /** Which document this result belongs to — what makes `loading` derivable. */
  forId: number;
  url: string | null;
  error: string | null;
}

interface DocumentFileState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Downloads the uploaded file and exposes it as an object URL.
 *
 * The fetch goes through apiFetchBlob rather than pointing an <img> or PDF.js
 * straight at the route, because the browser will not attach the Bearer header
 * to either. The object URL is revoked on cleanup — without that, a reviewer
 * working through twenty documents pins twenty files in memory.
 */
export function useDocumentFile(documentId: number | null): DocumentFileState {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (documentId === null) return;

    // A slow download that resolves after the user has moved on must not write
    // its URL into the next document's state.
    let cancelled = false;
    let objectUrl: string | null = null;

    getDocumentFile(documentId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ forId: documentId, url: objectUrl, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          forId: documentId,
          url: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  // Derived rather than a third state field: a stale result for the previous
  // document is exactly the condition that means "still loading this one".
  const settled = result !== null && result.forId === documentId;

  return {
    url: settled ? result.url : null,
    loading: documentId !== null && !settled,
    error: settled ? result.error : null,
  };
}
