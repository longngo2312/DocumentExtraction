import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Document, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { ActiveQuote } from "../../types";
import PdfPageLayer from "./PdfPageLayer";
import ViewerToolbar from "./ViewerToolbar";

// Module scope on purpose — setting this per render re-initialises the worker.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const PAGE_GUTTER = 8;

interface PdfViewerProps {
  url: string;
  filename: string;
  activeQuote: ActiveQuote | null;
  fallbackValue: string | null;
}

export default function PdfViewer({
  url,
  filename,
  activeQuote,
  fallbackValue,
}: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // Which quote failed to be located, rather than a boolean: keying it this way
  // means a newly clicked quote clears the banner on its own, with no reset
  // effect to keep in sync.
  const [missedColumnId, setMissedColumnId] = useState<number | null>(null);

  // Pages are laid out at an explicit pixel width, so the container has to be
  // measured before anything can render.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const measure = () =>
      setContainerWidth(Math.max(0, element.clientWidth - PAGE_GUTTER));

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleLocate = useCallback(
    (found: boolean) => {
      setMissedColumnId(found ? null : (activeQuote?.columnId ?? null));
    },
    [activeQuote],
  );

  const missed =
    activeQuote !== null && missedColumnId === activeQuote.columnId;

  const pageWidth = containerWidth * scale;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ViewerToolbar
        filename={filename}
        fileUrl={url}
        pageInfo={numPages > 0 ? `${numPages} page${numPages === 1 ? "" : "s"}` : undefined}
        onZoomIn={() => setScale((current) => Math.min(3, current + 0.2))}
        onZoomOut={() => setScale((current) => Math.max(0.5, current - 0.2))}
        onZoomReset={() => setScale(1)}
      />

      {missed && activeQuote && (
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          Couldn't find that quote on page {activeQuote.pageNumber}. The text
          layer may differ from what was parsed.
        </Alert>
      )}

      <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflow: "auto", p: 0.5 }}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Document
            // A string URL keeps this prop referentially stable; an inline
            // object literal re-downloads the file on every render.
            file={url}
            onLoadSuccess={(pdf) => {
              setNumPages(pdf.numPages);
              setError(null);
            }}
            onLoadError={(loadError) => setError(loadError.message)}
            loading={
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress size={28} />
              </Box>
            }
          >
            {pageWidth > 0 &&
              Array.from({ length: numPages }, (_unused, index) => {
                const pageNumber = index + 1;
                return (
                  <PdfPageLayer
                    key={pageNumber}
                    pageNumber={pageNumber}
                    width={pageWidth}
                    // Only the target page searches; every other page would
                    // report a miss and fight the banner.
                    activeQuote={
                      activeQuote?.pageNumber === pageNumber ? activeQuote : null
                    }
                    fallbackValue={fallbackValue}
                    onLocate={handleLocate}
                  />
                );
              })}
          </Document>
        )}

        {numPages > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", pb: 2 }}
          >
            End of document
          </Typography>
        )}
      </Box>
    </Box>
  );
}
