import { Alert, Box, CircularProgress } from "@mui/material";
import { useDocumentFile } from "../../hooks/useDocumentFile";
import type { ActiveQuote, DocumentListItem, ReviewPage } from "../../types";
import ImageViewer from "./ImageViewer";
import PdfViewer from "./PdfViewer";
import TextViewer from "./TextViewer";

type Strategy = "pdf" | "image" | "text";

/**
 * Only PDFs and images are rendered as themselves. Everything else — docx, xlsx,
 * pptx, csv, txt — falls back to the parsed text, which is already in the review
 * payload. That covers every supported upload with no conversion step and no
 * server-side LibreOffice.
 */
function strategyFor(mimeType: string): Strategy {
  if (mimeType.startsWith("application/pdf")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return "text";
}

interface DocumentViewerPanelProps {
  document: DocumentListItem;
  pages: ReviewPage[];
  activeQuote: ActiveQuote | null;
  /** The active field's value, used as the last rung of the search fallback. */
  fallbackValue: string | null;
}

export default function DocumentViewerPanel({
  document,
  pages,
  activeQuote,
  fallbackValue,
}: DocumentViewerPanelProps) {
  const strategy = strategyFor(document.mime_type);
  // The text path reads from the payload, so it never needs the file itself.
  const needsFile = strategy !== "text";
  const { url, loading, error } = useDocumentFile(
    needsFile ? document.id : null,
  );

  if (needsFile && loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  // A missing or unreadable file still leaves the parsed text, which is enough
  // to review against — better than an empty panel.
  if (needsFile && (error || !url)) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          {error ?? "Could not load the file"} — showing the parsed text instead.
        </Alert>
        <Box sx={{ flexGrow: 1, minHeight: 0 }}>
          <TextViewer pages={pages} activeQuote={activeQuote} />
        </Box>
      </Box>
    );
  }

  if (strategy === "pdf" && url) {
    return (
      <PdfViewer
        url={url}
        filename={document.filename}
        activeQuote={activeQuote}
        fallbackValue={fallbackValue}
      />
    );
  }

  if (strategy === "image" && url) {
    return (
      <ImageViewer
        url={url}
        filename={document.filename}
        activeQuote={activeQuote}
      />
    );
  }

  return <TextViewer pages={pages} activeQuote={activeQuote} />;
}
