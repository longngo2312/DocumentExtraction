import path from "path";
import { getImageText } from "./parsers/image.parser.js";
import { getDocxText } from "./parsers/docx.parser.js";
import { getPdfText } from "./parsers/pdf.parser.js";
import { getPptxText } from "./parsers/pptx.parser.js";
import { getPlainText } from "./parsers/text.parser.js";
import { getXlsxText } from "./parsers/xlsx.parser.js";
import { ParsingError } from "./parsing.error.js";
import type { ParserResult } from "./types.js";

export type Parser = (filePath: string) => Promise<ParserResult>;

//The mime type the browser sent. Trusted first, but only where it is unambiguous —
//.csv and .xls both arrive as application/vnd.ms-excel on Windows, and only one of
//those is readable, so neither is listed here. They fall through to the extension.
const BY_MIME: Record<string, Parser> = {
  "application/pdf": getPdfText,

  "image/png": getImageText,
  "image/jpeg": getImageText,
  "image/tiff": getImageText,

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    getDocxText,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    getXlsxText,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    getPptxText,

  "text/plain": getPlainText,
  "text/csv": getPlainText,
  "text/markdown": getPlainText,
};

//The fallback, for when the browser sent application/octet-stream, something
//ambiguous, or nothing at all.
const BY_EXTENSION: Record<string, Parser> = {
  ".pdf": getPdfText,

  ".png": getImageText,
  ".jpg": getImageText,
  ".jpeg": getImageText,
  ".tif": getImageText,
  ".tiff": getImageText,

  ".docx": getDocxText,
  ".xlsx": getXlsxText,
  ".pptx": getPptxText,

  ".txt": getPlainText,
  ".csv": getPlainText,
  ".md": getPlainText,
};

//shared with the upload filter, so the API rejects a file it could never parse
export const SUPPORTED_EXTENSIONS = Object.keys(BY_EXTENSION);

//"text/plain; charset=utf-8" and "TEXT/PLAIN" both mean text/plain
function normalizeMime(mimeType: string): string {
  return mimeType.split(";")[0]!.trim().toLowerCase();
}

export function selectParser(filePath: string, mimeType?: string): Parser {
  const mime = mimeType ? normalizeMime(mimeType) : "";
  const extension = path.extname(filePath).toLowerCase();

  const parser = BY_MIME[mime] ?? BY_EXTENSION[extension];
  if (!parser) {
    //name whichever of the two we actually have, so the user knows what was rejected
    const kind = extension || mime;
    throw new ParsingError(
      "unsupported",
      `Cannot read ${kind ? `${kind} files` : "this file"}. Supported types are ${SUPPORTED_EXTENSIONS.join(", ")}.`,
    );
  }
  return parser;
}
