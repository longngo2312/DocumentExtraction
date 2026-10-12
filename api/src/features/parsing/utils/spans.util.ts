import type { OcrWord } from "../ocr/tesseract.js";
import type { NormalizedBox, ParsedSpan } from "../types.js";

/**
 * Shared span assembly.
 *
 * The invariant this file exists to protect: for every span,
 * `text.slice(span.start, span.end)` is exactly the text that span came from.
 * That only holds if the string and the offsets are built in one pass, so both
 * helpers here return the text they measured rather than taking one in.
 */

/** Span ids are unique per document, so one counter is threaded through every page. */
export function createSpanIdCounter(): () => number {
  let next = 0;
  return () => next++;
}

/** Keeps a normalized coordinate inside 0..1 — OCR can report a box a pixel outside the image. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Normalize a pixel-space box against the image it was measured on.
 *
 * Returns null for a box with no area, which is a rect nothing can draw.
 */
export function normalizeBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): NormalizedBox | null {
  if (width <= 0 || height <= 0) return null;

  const box: NormalizedBox = [
    clamp01(x0 / width),
    clamp01(y0 / height),
    clamp01(x1 / width),
    clamp01(y1 / height),
  ];

  if (box[0] >= box[2] || box[1] >= box[3]) return null;
  return box;
}

interface AssembledPage {
  text: string;
  spans: ParsedSpan[];
}

/**
 * One page of OCR output: word spans, and the page string they index into.
 *
 * `pageWidth`/`pageHeight` are the dimensions of the image Tesseract actually
 * read — for a PDF that is the *scaled screenshot*, not the page in points.
 */
export function pageFromWords(
  words: OcrWord[],
  pageWidth: number,
  pageHeight: number,
  nextSpanId: () => number,
): AssembledPage {
  const spans: ParsedSpan[] = [];
  let text = "";
  let previous: OcrWord | null = null;

  for (const word of words) {
    if (!word.text.trim()) continue;

    if (previous) {
      // Tesseract emits words in reading order, so a downward jump of more than
      // half a line height is a new line rather than the next word along.
      const lineHeight = previous.bbox.y1 - previous.bbox.y0;
      const dropped = word.bbox.y0 - previous.bbox.y0 > lineHeight * 0.5;
      text += dropped ? "\n" : " ";
    }

    const start = text.length;
    text += word.text;

    spans.push({
      id: nextSpanId(),
      start,
      end: text.length,
      bbox: normalizeBox(
        word.bbox.x0,
        word.bbox.y0,
        word.bbox.x1,
        word.bbox.y1,
        pageWidth,
        pageHeight,
      ),
    });

    previous = word;
  }

  return { text, spans };
}

export interface TextBlock {
  text: string;
  /** Format-native address, carried onto the span — a spreadsheet cell. */
  ref?: string;
  /**
   * What separates this block from the previous one, overriding the default.
   * A spreadsheet needs two: tab between cells, newline at the start of a row.
   */
  breakBefore?: string;
}

/**
 * The geometry-free sibling of pageFromWords, for formats that carry no
 * coordinates: docx paragraphs, pptx paragraphs, spreadsheet cells.
 *
 * A blank block still contributes its separator but gets no span. Dropping it
 * outright would shift every following spreadsheet cell one column left, and a
 * span nothing can be quoted from is only noise for the chunker.
 */
export function pageFromBlocks(
  blocks: TextBlock[],
  separator: string,
  nextSpanId: () => number,
): AssembledPage {
  const spans: ParsedSpan[] = [];
  let text = "";

  blocks.forEach((block, index) => {
    // Index-based, not "text is non-empty": N blocks always get N-1 separators,
    // so a leading blank cell still holds its column.
    if (index > 0) text += block.breakBefore ?? separator;

    if (!block.text.trim()) return;

    const start = text.length;
    text += block.text;

    spans.push({
      id: nextSpanId(),
      start,
      end: text.length,
      bbox: null,
      ...(block.ref ? { ref: block.ref } : {}),
    });
  });

  return { text, spans };
}
