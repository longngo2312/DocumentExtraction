import fs from "fs";
import * as XLSX from "xlsx";
import { ParsingError } from "../parsing.error.js";
import type { ParsedPage, ParserResult } from "../types.js";
import { assertOoxml } from "../utils/ooxml.util.js";
import {
  createSpanIdCounter,
  pageFromBlocks,
  type TextBlock,
} from "../utils/spans.util.js";
import { joinPages } from "../utils/text.util.js";

// A 50k-row export would otherwise put megabytes into spans_json that
// MAX_INPUT_CHARS guarantees the model never reads.
const MAX_SHEET_ROWS = 5000;

/**
 * One page per sheet.
 *
 * The text is built cell by cell rather than via sheet_to_csv, because the two
 * disagree about quoting and blank runs — and the moment they disagree, the
 * offsets stop pointing at the cells the spans claim.
 */
export async function getXlsxText(path: string): Promise<ParserResult> {
  const bytes = new Uint8Array(fs.readFileSync(path));
  assertOoxml(bytes);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer" });
  } catch (error) {
    throw new ParsingError(
      "corrupt",
      `This spreadsheet could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const nextSpanId = createSpanIdCounter();
  const warning: string[] = [];
  const pages: ParsedPage[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const ref = sheet?.["!ref"];

    // An empty tab in a workbook is not a failed parse.
    if (!sheet || !ref) {
      warning.push(`Sheet "${name}" is empty.`);
      continue;
    }

    const range = XLSX.utils.decode_range(ref);
    const lastRow = Math.min(range.e.r, range.s.r + MAX_SHEET_ROWS - 1);
    if (range.e.r > lastRow) {
      warning.push(
        `Sheet "${name}": only the first ${MAX_SHEET_ROWS} rows were read.`,
      );
    }

    const blocks: TextBlock[] = [];
    for (let r = range.s.r; r <= lastRow; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[address] as XLSX.CellObject | undefined;

        // `w` is the formatted text Excel displays, which is what the reviewer
        // sees and therefore what the model will quote. `v` is the raw value —
        // quoting a currency or date from it would never resolve.
        const value =
          cell === undefined
            ? ""
            : (cell.w ?? (cell.v === undefined ? "" : String(cell.v)));

        blocks.push({
          text: value,
          ref: `${name}!${address}`,
          // Tab between cells, newline at the start of each row after the first.
          breakBefore: c === range.s.c && r > range.s.r ? "\n" : "\t",
        });
      }
    }

    const { text, spans } = pageFromBlocks(blocks, "\t", nextSpanId);

    pages.push({
      // Numbered off the pages actually kept, not the sheet index — joinPages
      // marks pages by array position, and a skipped empty sheet would
      // otherwise leave a gap that sends every page hint to the wrong sheet.
      page: pages.length + 1,
      text,
      source: "text",
      spans,
      width: 0,
      height: 0,
      label: name,
    });
  }

  const text = joinPages(pages);
  if (!text.trim()) {
    throw new ParsingError(
      "empty",
      "No text could be found in this spreadsheet. Every sheet is blank.",
    );
  }

  return {
    text,
    pages,
    pageCount: pages.length,
    method: "xlsx",
    warning,
  };
}
