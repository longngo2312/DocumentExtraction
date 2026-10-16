/**
 * Page text → retrievable passages that keep their provenance.
 *
 * The invariant this file exists to protect, for every chunk:
 *   pages[chunk.page - 1].text.slice(chunk.charStart, chunk.charEnd) === chunk.text
 * Offsets are page-local — the same frame as extracted_values.source_start — so
 * citations reuse HighlightOverlay/TextViewer unchanged. See docs/phase6-rag,
 * Stage 2.
 */

import type { PageSpans } from "../../extraction/models/extraction.model.js";
import { groupIntoLines } from "../../extraction/utils/resolveQuote.util.js";
import type {
  NormalizedBox,
  ParsedPage,
  ParsedSpan,
} from "../../parsing/types.js";

/**
 * One passage, ready to insert into document_chunks and embed.
 */
export interface Chunk {
  chunkIndex: number;
  page: number;
  text: string;
  charStart: number;
  charEnd: number;
  spanIds: number[];
  boxes: NormalizedBox[];
  tokenEstimate: number;
}

const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 200;
const CHUNK_MIN_CHARS = 100;

export function chunkPages(
  pages: ParsedPage[],
  spansByPage: Map<number, PageSpans>,
): Chunk[] {
  const chunks: Chunk[] = [];

  // Chunk WITHIN a page, never across one — a cross-page chunk has no single
  // page and no valid offset pair.
  for (const page of pages) {
    const text = page.text;
    let start = 0;

    while (start < text.length) {
      const end = findBoundary(text, start);
      const slice = text.slice(start, end);

      if (slice.trim().length >= CHUNK_MIN_CHARS) {
        const covered = coveredSpans(spansByPage.get(page.page), start, end);
        chunks.push({
          chunkIndex: chunks.length,
          page: page.page,
          text: slice,
          charStart: start,
          charEnd: end,
          spanIds: covered.map((span) => span.id),
          boxes: groupIntoLines(covered),
          tokenEstimate: estimateTokens(slice),
        });
      }

      if (end === text.length) break;
      start = nextStart(text, start, end);
    }
  }

  return chunks;
}

function nextStart(text: string, start: number, end: number): number {
  const back = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  const ws = text.slice(back, end).search(/\s/);
  return ws === -1 ? end : back + ws + 1;
}

export function findBoundary(text: string, start: number): number {
  const separators = [["\n\n"], ["\n"], [". ", "? ", "! "], [" "], [""]];
  const limit = Math.min(start + CHUNK_TARGET_CHARS, text.length);
  if (limit === text.length) return limit;

  for (const group of separators) {
    const end = Math.max(
      ...group.map((sep) => {
        const idx = text.lastIndexOf(sep, limit - sep.length);
        return idx === -1 ? -1 : idx + sep.trimEnd().length;
      }),
    );

    if (end > start + CHUNK_MIN_CHARS) return end;
  }
  return limit;
}

export function coveredSpans(
  pageSpans: PageSpans | undefined,
  charStart: number,
  charEnd: number,
): ParsedSpan[] {
  return (pageSpans?.spans ?? []).filter(
    (span) => span.start < charEnd && span.end > charStart,
  );
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
