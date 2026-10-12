import { Box, Chip, Paper, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import type { ActiveQuote, ReviewPage } from "../../types";
import { normalizeForSearch } from "../../utils/quoteSearch";

interface TextViewerProps {
  pages: ReviewPage[];
  activeQuote: ActiveQuote | null;
}

interface Segment {
  text: string;
  highlighted: boolean;
}

/**
 * Locates the quote within one page's text.
 *
 * source_start/source_end index into exactly this string — the server resolved
 * the quote against the same parsed text the payload ships — so the common path
 * is a straight slice with no searching. The search is only for quotes the
 * server placed on another page, or offsets that look wrong.
 */
function locate(page: ReviewPage, quote: ActiveQuote): [number, number] | null {
  if (
    quote.start !== null &&
    quote.end !== null &&
    quote.pageNumber === page.page &&
    quote.end <= page.text.length
  ) {
    return [quote.start, quote.end];
  }

  const direct = page.text.indexOf(quote.quote);
  if (direct !== -1) return [direct, direct + quote.quote.length];

  // Last resort: match with whitespace and punctuation folded, then map back.
  const haystack = normalizeForSearch(page.text);
  const needle = normalizeForSearch(quote.quote).normalized;
  if (!needle) return null;

  const hit = haystack.normalized.indexOf(needle);
  if (hit === -1) return null;

  return [haystack.map[hit], haystack.map[hit + needle.length - 1] + 1];
}

function segmentsFor(page: ReviewPage, quote: ActiveQuote | null): Segment[] {
  if (!quote) return [{ text: page.text, highlighted: false }];

  const span = locate(page, quote);
  if (!span) return [{ text: page.text, highlighted: false }];

  const [start, end] = span;
  return [
    { text: page.text.slice(0, start), highlighted: false },
    { text: page.text.slice(start, end), highlighted: true },
    { text: page.text.slice(end), highlighted: false },
  ].filter((segment) => segment.text.length > 0);
}

/**
 * Plain-text rendering of the parsed pages. Covers docx/xlsx/pptx/csv/txt with
 * no conversion step, since the parsed text already arrives in the payload, and
 * doubles as the fallback when a PDF will not render.
 */
export default function TextViewer({ pages, activeQuote }: TextViewerProps) {
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!activeQuote) return;
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeQuote]);

  if (pages.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          No parsed text for this document.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 2 }}>
      {pages.map((page) => (
        <Paper key={page.page} variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            {/* A spreadsheet's unit is a sheet and a deck's is a slide; the
                number stays alongside so a page hint of 2 is still traceable
                to what the reviewer is looking at. */}
            <Typography variant="caption" color="text.secondary">
              {page.label ?? `Page ${page.page}`}
            </Typography>
            {page.label && (
              <Typography variant="caption" color="text.disabled">
                p.{page.page}
              </Typography>
            )}
            {page.source === "ocr" && (
              <Chip
                label="OCR"
                size="small"
                variant="outlined"
                color="warning"
                sx={{ height: 18, fontSize: 11 }}
              />
            )}
          </Box>

          <Box
            component="pre"
            sx={{
              m: 0,
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {segmentsFor(page, activeQuote).map((segment, index) =>
              segment.highlighted ? (
                <Box
                  key={index}
                  component="mark"
                  ref={markRef}
                  sx={{
                    bgcolor: "warning.light",
                    color: "inherit",
                    borderRadius: 0.5,
                    px: 0.25,
                  }}
                >
                  {segment.text}
                </Box>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
