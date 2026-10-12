import fs from "fs";
import mammoth from "mammoth";
import { ParsingError } from "../parsing.error.js";
import type { ParserResult } from "../types.js";
import { assertOoxml } from "../utils/ooxml.util.js";
import {
  createSpanIdCounter,
  pageFromBlocks,
  type TextBlock,
} from "../utils/spans.util.js";

/**
 * One page, paragraph spans.
 *
 * A docx has no page breaks recoverable without laying it out, so page 1 is the
 * honest answer here — unlike xlsx and pptx, which carry real units.
 *
 * convertToHtml would give more structure but needs an HTML walker to recover
 * offsets, and buys nothing while every bbox on this path is null.
 */
export async function getDocxText(path: string): Promise<ParserResult> {
  const bytes = new Uint8Array(fs.readFileSync(path));
  assertOoxml(bytes);

  let raw: string;
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    raw = result.value;
  } catch (error) {
    throw new ParsingError(
      "corrupt",
      `This document could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // mammoth separates paragraphs with "\n\n" and keeps tabs as "\t". Table cells
  // arrive as their own paragraphs, so table content gets spans for free.
  const blocks: TextBlock[] = raw
    .split(/\n{2,}/)
    .map((paragraph) => ({ text: paragraph.trim() }))
    .filter((block) => block.text.length > 0);

  // The page string is rebuilt from these blocks rather than reusing `raw`:
  // splitting on \n{2,} and rejoining with a fixed "\n\n" changes length
  // wherever three or more newlines ran together, and every offset with it.
  const { text, spans } = pageFromBlocks(blocks, "\n\n", createSpanIdCounter());

  if (!text.trim()) {
    throw new ParsingError(
      "empty",
      "No text could be found in this document. It may be blank, or contain only images.",
    );
  }

  return {
    text,
    pages: [
      { page: 1, text, source: "text", spans, width: 0, height: 0 },
    ],
    pageCount: 1,
    method: "docx",
    warning: [],
  };
}
