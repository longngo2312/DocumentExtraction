import fs from "fs";
import { parseStringPromise } from "xml2js";
import { ParsingError } from "../parsing.error.js";
import type { ParsedPage, ParserResult } from "../types.js";
import { assertOoxml, readZip } from "../utils/ooxml.util.js";
import {
  createSpanIdCounter,
  pageFromBlocks,
  type TextBlock,
} from "../utils/spans.util.js";
import { joinPages } from "../utils/text.util.js";

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

/**
 * Text of one <a:p> paragraph, concatenated from its <a:r><a:t> runs.
 *
 * xml2js hands back a tree of unknown shape, so this walks defensively rather
 * than indexing a path that a slide with no runs would not have.
 */
function paragraphText(paragraph: unknown): string {
  const runs = (paragraph as { "a:r"?: unknown[] })?.["a:r"];
  if (!Array.isArray(runs)) return "";

  return runs
    .map((run) => {
      const t = (run as { "a:t"?: unknown[] })?.["a:t"];
      return Array.isArray(t) ? t.map((v) => String(v)).join("") : "";
    })
    .join("");
}

/** Every <a:p> in the slide, in document order, wherever it is nested. */
function collectParagraphs(node: unknown, into: unknown[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectParagraphs(child, into);
    return;
  }
  if (node === null || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "a:p" && Array.isArray(value)) {
      into.push(...value);
      continue;
    }
    collectParagraphs(value, into);
  }
}

/**
 * One page per slide.
 *
 * Parsed with xml2js rather than a regex over <a:t>: slide text carries XML
 * entities, and handing the model "&amp;" where the deck says "&" makes the
 * quote fail to resolve for a reason nobody would guess from the symptom.
 */
export async function getPptxText(path: string): Promise<ParserResult> {
  const bytes = new Uint8Array(fs.readFileSync(path));
  assertOoxml(bytes);

  const zip = readZip(bytes);

  // Sorted by the captured number, not by filename — a string sort puts
  // slide10.xml before slide2.xml and silently reorders the deck.
  // Speaker notes live in ppt/notesSlides/ and are deliberately not read: a
  // quote resolving to a note the reviewer cannot see is worse than no quote.
  const slides = Object.keys(zip)
    .map((name) => ({ name, match: SLIDE_PATH.exec(name) }))
    .filter((entry) => entry.match !== null)
    .map((entry) => ({ name: entry.name, number: Number(entry.match![1]) }))
    .sort((a, b) => a.number - b.number);

  const nextSpanId = createSpanIdCounter();
  const warning: string[] = [];
  const pages: ParsedPage[] = [];

  for (const slide of slides) {
    let parsed: unknown;
    try {
      parsed = await parseStringPromise(Buffer.from(zip[slide.name]));
    } catch (error) {
      warning.push(
        `Slide ${slide.number} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const paragraphs: unknown[] = [];
    collectParagraphs(parsed, paragraphs);

    const blocks: TextBlock[] = paragraphs
      .map((paragraph) => ({ text: paragraphText(paragraph) }))
      .filter((block) => block.text.trim().length > 0);

    const { text, spans } = pageFromBlocks(blocks, "\n", nextSpanId);

    pages.push({
      // Numbered off the pages kept, so joinPages' markers and page.page agree
      // even when a slide failed to parse.
      page: pages.length + 1,
      text,
      source: "text",
      spans,
      width: 0,
      height: 0,
      label: `Slide ${slide.number}`,
    });
  }

  const text = joinPages(pages);
  if (!text.trim()) {
    throw new ParsingError(
      "empty",
      "No text could be found in this presentation. The slides may contain only images.",
    );
  }

  return {
    text,
    pages,
    pageCount: pages.length,
    method: "pptx",
    warning,
  };
}
