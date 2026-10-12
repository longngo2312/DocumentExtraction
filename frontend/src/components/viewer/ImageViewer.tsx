import { Alert, Box } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveQuote } from "../../types";
import type { HighlightRect } from "../../utils/quoteSearch";
import HighlightOverlay from "./HighlightOverlay";
import ViewerToolbar from "./ViewerToolbar";

interface ImageViewerProps {
  url: string;
  filename: string;
  activeQuote: ActiveQuote | null;
}

/**
 * Scanned pages and photos.
 *
 * There is no text layer to search here, so the highlight comes entirely from
 * the OCR word boxes the parser now keeps: normalized against the image's own
 * pixel dimensions server-side, scaled back up to whatever size the <img> is
 * rendered at.
 */
export default function ImageViewer({
  url,
  filename,
  activeQuote,
}: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<HighlightRect[]>([]);

  const locate = useCallback(() => {
    const image = imageRef.current;
    const boxes = activeQuote?.boxes;

    if (!image || !boxes || boxes.length === 0) {
      setRects([]);
      return;
    }

    // Zero before the image decodes — scaling against it collapses every rect,
    // so wait for the load event rather than drawing nothing visible.
    if (image.clientWidth === 0 || image.clientHeight === 0) {
      setRects([]);
      return;
    }

    setRects(
      boxes.map(([x0, y0, x1, y1]) => ({
        top: y0 * image.clientHeight,
        left: x0 * image.clientWidth,
        width: (x1 - x0) * image.clientWidth,
        height: (y1 - y0) * image.clientHeight,
      })),
    );
  }, [activeQuote]);

  useEffect(() => {
    locate();
  }, [locate, scale]);

  // The rendered size changes with the zoom control and with the panel width.
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const observer = new ResizeObserver(() => locate());
    observer.observe(image);
    return () => observer.disconnect();
  }, [locate]);

  // Scroll once per quote, not on every recompute — see PdfPageLayer. The zoom
  // control and the panel resize both re-run locate(), and a [rects] dependency
  // would drag the reader back to the highlight each time.
  const scrolledFor = useRef<ActiveQuote | null>(null);

  useEffect(() => {
    if (rects.length === 0 || !activeQuote) return;
    if (scrolledFor.current === activeQuote) return;

    scrolledFor.current = activeQuote;
    markerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [rects, activeQuote]);

  // A quote the server placed but could not give geometry for — an image whose
  // OCR found the words but not this phrase.
  const missing =
    activeQuote !== null &&
    (!activeQuote.boxes || activeQuote.boxes.length === 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ViewerToolbar
        filename={filename}
        fileUrl={url}
        onZoomIn={() => setScale((current) => Math.min(4, current + 0.25))}
        onZoomOut={() => setScale((current) => Math.max(0.5, current - 0.25))}
        onZoomReset={() => setScale(1)}
      />

      {missing && (
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          That quote has no location on this scan — the words it names were not
          found in the OCR output.
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: "auto", p: 2 }}>
        <Box
          sx={{
            position: "relative",
            width: `${scale * 100}%`,
            mx: "auto",
            transition: "width 120ms",
          }}
        >
          <img
            ref={imageRef}
            src={url}
            alt={filename}
            onLoad={locate}
            style={{ width: "100%", display: "block" }}
          />
          <HighlightOverlay rects={rects} />

          {rects.length > 0 && (
            <Box
              ref={markerRef}
              sx={{
                position: "absolute",
                top: rects[0].top,
                left: rects[0].left,
                width: 1,
                height: rects[0].height,
                pointerEvents: "none",
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
