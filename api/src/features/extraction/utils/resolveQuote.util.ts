import type {
  NormalizedBox,
  ParsedPage,
  ParsedSpan,
} from "../../parsing/types.js";
import type { PageSpans } from "../models/extraction.model.js";

export interface QuoteLocation {
  page: number | null;
  start: number | null;
  end: number | null;
  /** Stable identity for the matched spans — survives a re-render or a re-parse. */
  spanIds: number[];
  /** Denormalized geometry, one rect per line, ready for the client to draw. */
  boxes: NormalizedBox[];
  matchKind: "exact" | "normalized" | "none";
  confidence: number;
}

const NONE: QuoteLocation = {
  page: null,
  start: null,
  end: null,
  spanIds: [],
  boxes: [],
  matchKind: "none",
  confidence: 0.0,
};

/**
 * Try an exact `indexOf` on `text`. Returns `[start, end)` or null.
 */
function exactMatch(text: string, quote: string): [number, number] | null {
  const idx = text.indexOf(quote);
  if (idx === -1) return null;
  return [idx, idx + quote.length];
}

/**
 * Build a whitespace-stripped version of `text` plus a map from stripped index
 * back to original index.
 */
function buildNormalized(text: string): { norm: string; origIndex: number[] } {
  const chars: string[] = [];
  const origIndex: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      chars.push(text[i]);
      origIndex.push(i);
    }
  }
  return { norm: chars.join(""), origIndex };
}

/**
 * Whitespace-normalized match. Returns original `[start, end)` or null.
 */
function normalizedMatch(text: string, quote: string): [number, number] | null {
  const hay = buildNormalized(text);
  const needle = buildNormalized(quote);
  if (needle.norm.length === 0) return null;

  const idx = hay.norm.indexOf(needle.norm);
  if (idx === -1) return null;

  const origStart = hay.origIndex[idx];
  const origEnd = hay.origIndex[idx + needle.norm.length - 1] + 1;
  return [origStart, origEnd];
}

/** Two boxes are on the same line when their vertical bands overlap by over half. */
function sameLine(a: NormalizedBox, b: NormalizedBox): boolean {
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const shorter = Math.min(a[3] - a[1], b[3] - b[1]);
  return shorter > 0 && overlap > 0.5 * shorter;
}

function union(a: NormalizedBox, b: NormalizedBox): NormalizedBox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

/**
 * One rect per line, not one box per span and not one box for the whole match.
 *
 * Spans are per-text-item or per-word, so several sit on a line: a per-span
 * result draws a rect around every word, and a single union of a quote that
 * wraps draws one tall box swallowing the right margin.
 */
function groupIntoLines(spans: ParsedSpan[]): NormalizedBox[] {
  const lines: NormalizedBox[] = [];

  for (const span of spans) {
    // Office and plain-text spans have no geometry; they still count towards
    // spanIds, they just contribute no rect.
    if (!span.bbox) continue;

    const current = lines[lines.length - 1];
    if (current && sameLine(current, span.bbox)) {
      lines[lines.length - 1] = union(current, span.bbox);
    } else {
      lines.push([...span.bbox]);
    }
  }

  return lines;
}

/**
 * Verify that the LLM's quote actually exists in the parsed page text, and bind
 * it to the geometry of the spans it covers.
 *
 * Cascade: exact match on hinted page → exact on all pages → normalized on
 * hinted page → normalized on all pages → none.
 *
 * Confidence: 0.9 exact, 0.7 normalized, 0.0 none.
 */
export function resolveQuote(
  quote: string | null,
  pages: ParsedPage[],
  hintedPage: number | null,
  spansByPage: Map<number, PageSpans>,
): QuoteLocation {
  if (!quote || pages.length === 0) return NONE;

  // Order pages so the hinted page comes first (tiebreak for short quotes that
  // appear on multiple pages).
  const ordered = hintedPage
    ? [
        ...pages.filter((p) => p.page === hintedPage),
        ...pages.filter((p) => p.page !== hintedPage),
      ]
    : pages;

  const located = (
    pageNumber: number,
    hit: [number, number],
    matchKind: "exact" | "normalized",
    confidence: number,
  ): QuoteLocation => {
    const [start, end] = hit;
    // Half-open ranges overlap when each starts before the other ends.
    const covered = (spansByPage.get(pageNumber)?.spans ?? []).filter(
      (span) => span.start < end && span.end > start,
    );

    return {
      page: pageNumber,
      start,
      end,
      spanIds: covered.map((span) => span.id),
      boxes: groupIntoLines(covered),
      matchKind,
      confidence,
    };
  };

  // Pass 1: exact match
  for (const pg of ordered) {
    const hit = exactMatch(pg.text, quote);
    if (hit) return located(pg.page, hit, "exact", 0.9);
  }

  // Pass 2: whitespace-normalized match
  for (const pg of ordered) {
    const hit = normalizedMatch(pg.text, quote);
    if (hit) return located(pg.page, hit, "normalized", 0.7);
  }

  return NONE;
}
