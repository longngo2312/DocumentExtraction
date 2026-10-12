import path from "path";
import { selectParser } from "./router.js";
import type { ParsedDocument } from "./types.js";

export async function parsedDocument(
  filePath: string,
  mimeType?: string,
): Promise<ParsedDocument> {
  //an absolute path, so a relative one from the command line works too
  const absolutePath = path.resolve(filePath);

  //picked before the clock starts — an unsupported file never touches a parser
  const parser = selectParser(absolutePath, mimeType);

  const startedAt = Date.now();
  const result = await parser(absolutePath);

  return {
    ...result,
    charCount: result.text.length,
    durationMs: Date.now() - startedAt,
  };
}

export { shutdownOcr } from "./ocr/tesseract.js";
export { ParsingError } from "./parsing.error.js";
export { SUPPORTED_EXTENSIONS } from "./router.js";
export type {
  NormalizedBox,
  ParsedDocument,
  ParsedPage,
  ParsedSpan,
  ParseMethod,
  ParserResult,
} from "./types.js";
