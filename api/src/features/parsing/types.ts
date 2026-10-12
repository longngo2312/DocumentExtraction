//type of parsing methods
export type ParseMethod =
  | "pdf-text"
  | "pdf-ocr"
  | "pdf-hybrid"
  | "image-ocr"
  | "docx"
  | "xlsx"
  | "pptx"
  | "plain";

/** Normalized to 0..1 against the page box, origin top-left. Render-scale independent. */
export type NormalizedBox = [x0: number, y0: number, x1: number, y1: number];

export interface ParsedSpan {
  id: number;
  start: number;
  end: number;
  bbox: NormalizedBox | null;
  ref?: string;
}

export interface ParsedPage {
  text: string;
  page: number;
  source: "text" | "ocr";
  spans: ParsedSpan[];
  width: number;
  height: number;
  label?: string;
}

export interface ParsedDocument {
  text: string;
  pages: ParsedPage[];
  pageCount: number;
  method: ParseMethod;
  charCount: number;
  warning: string[];
  durationMs: number;
}

//what every parser returns — extractText() adds charCount and durationMs
export type ParserResult = Omit<ParsedDocument, "charCount" | "durationMs">;
