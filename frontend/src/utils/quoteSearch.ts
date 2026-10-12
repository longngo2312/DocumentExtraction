/**
 * Locating a model-supplied quote inside a rendered PDF text layer.
 *
 * The server already found the quote in its own parsed text and stored offsets,
 * but those index into pdf-parse's output. PDF.js tokenizes the same page
 * differently — different span boundaries, different whitespace — so the offsets
 * do not transfer and the quote has to be found again in the text we rendered.
 *
 * No React in here on purpose: this is the part worth reasoning about (and
 * testing) on its own.
 */

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Curly quotes and dashes differ between what the model emits, what the PDF
// producer embedded, and what PDF.js reports. Fold them all to one form.
const CHAR_FOLD: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  " ": " ",
};

/**
 * Fold case, normalize punctuation, and collapse every whitespace run to a
 * single space.
 *
 * `map[i]` is the index in `text` that normalized character `i` came from, which
 * is what lets a match be walked back to real DOM positions.
 */
export function normalizeForSearch(text: string): {
  normalized: string;
  map: number[];
} {
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // true at the start, so leading whitespace is dropped

  for (let i = 0; i < text.length; i++) {
    const raw = text[i];
    const folded = CHAR_FOLD[raw] ?? raw;

    if (/\s/.test(folded)) {
      if (lastWasSpace) continue;
      chars.push(" ");
      map.push(i);
      lastWasSpace = true;
      continue;
    }

    chars.push(folded.toLowerCase());
    map.push(i);
    lastWasSpace = false;
  }

  // A trailing space would never match anything useful.
  if (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }

  return { normalized: chars.join(""), map };
}

/** The first `count` whitespace-separated words — the first rung of the fallback ladder. */
export function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).slice(0, count).join(" ");
}

interface SpanChar {
  spanIndex: number;
  offset: number;
}

/**
 * Finds `quote` across the page's text-layer spans and returns a DOM Range
 * spanning it, or null when it isn't there.
 */
export function findQuoteRange(
  spans: HTMLElement[],
  quote: string,
): Range | null {
  if (!quote.trim() || spans.length === 0) return null;

  // Flatten every span's text into one string, remembering where each character
  // came from. PDF.js breaks lines — and often words — across spans, so a quote
  // of any length routinely straddles several.
  let pageText = "";
  const origin: SpanChar[] = [];

  spans.forEach((span, spanIndex) => {
    const text = span.textContent ?? "";
    for (let offset = 0; offset < text.length; offset++) {
      origin.push({ spanIndex, offset });
    }
    pageText += text;
  });

  const haystack = normalizeForSearch(pageText);
  const needle = normalizeForSearch(quote).normalized;
  if (!needle) return null;

  const hit = haystack.normalized.indexOf(needle);
  if (hit === -1) return null;

  const startOrigin = origin[haystack.map[hit]];
  const endOrigin = origin[haystack.map[hit + needle.length - 1]];
  if (!startOrigin || !endOrigin) return null;

  const startNode = spans[startOrigin.spanIndex].firstChild;
  const endNode = spans[endOrigin.spanIndex].firstChild;
  // A span PDF.js has emptied or re-rendered has no text node to anchor to.
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  try {
    range.setStart(startNode, startOrigin.offset);
    // The range end is exclusive, so it sits one past the last matched char.
    range.setEnd(endNode, endOrigin.offset + 1);
  } catch {
    // Offsets can fall outside a node if the text layer re-rendered mid-search.
    return null;
  }

  return range;
}

/**
 * Tries each candidate in order and returns the first hit.
 *
 * Callers pass a ladder — the full quote, then its opening words, then the
 * extracted value — because the model paraphrases and OCR pages rarely match
 * verbatim. Landing on roughly the right line beats highlighting nothing.
 */
export function findBestRange(
  spans: HTMLElement[],
  candidates: (string | null)[],
): Range | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const range = findQuoteRange(spans, candidate);
    if (range) return range;
  }
  return null;
}

/**
 * Range rects converted to offsets within `container`, which must be
 * position:relative for the overlay to line up.
 *
 * getClientRects returns one rect per visual line, so a quote that wraps
 * highlights as separate bars rather than one box swallowing the margin.
 */
export function rectsFromRange(
  range: Range,
  container: HTMLElement,
): HighlightRect[] {
  const base = container.getBoundingClientRect();

  return Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      // Both rects are viewport-relative, so the difference is scroll-independent.
      top: rect.top - base.top,
      left: rect.left - base.left,
      width: rect.width,
      height: rect.height,
    }));
}
