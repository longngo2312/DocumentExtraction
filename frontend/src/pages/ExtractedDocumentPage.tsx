import { Alert, Box, CircularProgress, Paper } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getReview, saveReview } from "../api/documents";
import ReviewPanel from "../components/extraction/ReviewPanel";
import type { SplitPaneTab } from "../components/layout/SplitPane";
import SplitPane from "../components/layout/SplitPane";
import DocumentViewerPanel from "../components/viewer/DocumentViewerPanel";
import type { ActiveQuote, ReviewField, ReviewPayload } from "../types";

export default function ExtractedDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const location = useLocation();
  // A chat citation navigates here with the quote in router state; picking it up
  // as the initial value means the highlight is live on first paint.
  const incomingQuote =
    (location.state as { quote?: ActiveQuote } | null)?.quote ?? null;

  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  // The id the current payload belongs to, so `loading` can be derived instead
  // of flipped synchronously inside the effect.
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Unsaved verdicts, keyed by column_id. A key present with a null value means
  // "rejected" — which is why this is a Map rather than a plain object with
  // undefined holes.
  const [edits, setEdits] = useState<Map<number, string | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [activeQuote, setActiveQuote] = useState<ActiveQuote | null>(incomingQuote);
  const [mobileTab, setMobileTab] = useState<SplitPaneTab>(
    incomingQuote ? "left" : "right",
  );

  const load = useCallback(() => {
    // Every setState sits inside a .then so none of them run synchronously
    // within the effect that calls this.
    return getReview(documentId)
      .then((data) => {
        setPayload(data);
        setEdits(new Map());
        setLoadError(null);
      })
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setLoadedId(documentId));
  }, [documentId]);

  const loading = loadedId !== documentId;

  useEffect(() => {
    if (Number.isInteger(documentId) && documentId > 0) load();
  }, [documentId, load]);

  function handleSetValue(columnId: number, value: string | null) {
    setEdits((current) => new Map(current).set(columnId, value));
  }

  function handleQuoteClick(field: ReviewField) {
    if (!field.llm_quote) return;

    setActiveQuote({
      columnId: field.column_id,
      quote: field.llm_quote,
      pageNumber: field.source_page ?? 1,
      start: field.source_start,
      end: field.source_end,
      boxes: field.source_boxes,
    });
    // On a phone the document is behind a tab, so a click that only sets state
    // would look like nothing happened.
    setMobileTab("left");
  }

  function handleSave() {
    setSaving(true);
    setSaveError(null);

    const payloadEdits = Array.from(edits, ([column_id, value]) => ({
      column_id,
      value,
    }));

    saveReview(documentId, payloadEdits)
      // Refetch rather than patching local state: the server derives each
      // review_status and re-coerces every value, so its copy is the truth.
      .then(() => load())
      .catch((error: unknown) =>
        setSaveError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setSaving(false));
  }

  if (!Number.isInteger(documentId) || documentId <= 0) {
    return <Alert severity="error">Invalid document id.</Alert>;
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          py: 12,
          flexDirection: "column",
          gap: 2,
        }}
      >
        <CircularProgress size={36} sx={{ color: "primary.main" }} />
      </Box>
    );
  }

  if (loadError || !payload) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {loadError ?? "Document not found."}
      </Alert>
    );
  }

  const activeField =
    payload.fields.find((field) => field.column_id === activeQuote?.columnId) ??
    null;

  return (
    <Paper
      variant="outlined"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        overflow: "hidden",
        borderRadius: 2,
        boxShadow: 1,
        border: "1px solid",
        borderColor: "divider",
        m: { xs: 1.5, sm: 2 },
      }}
    >
      <SplitPane
        leftLabel="Document"
        rightLabel="Extracted values"
        mobileTab={mobileTab}
        onMobileTabChange={setMobileTab}
        left={
          <DocumentViewerPanel
            document={payload.document}
            pages={payload.pages}
            activeQuote={activeQuote}
            fallbackValue={activeField?.value_text ?? null}
          />
        }
        right={
          <ReviewPanel
            document={payload.document}
            fields={payload.fields}
            summary={payload.summary}
            edits={edits}
            activeColumnId={activeQuote?.columnId ?? null}
            saving={saving}
            saveError={saveError}
            onQuoteClick={handleQuoteClick}
            onSetValue={handleSetValue}
            onSave={handleSave}
          />
        }
      />
    </Paper>
  );
}
