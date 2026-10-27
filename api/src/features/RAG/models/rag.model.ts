import type { NormalizedBox } from "../../parsing/types.js";

/**
 * Anything an answer may cite — a retrieved passage or a reviewed extracted
 * value. Both tools normalise to this, so the answer step numbers them 1..N
 * the same way and the viewer highlights either through one code path.
 */
export interface Source {
  kind: "passage" | "value";
  documentId: number;
  filename: string;
  page: number;
  /** What the model reads for this source. */
  text: string;
  /** What the viewer highlights, or searches for when offsets are absent. */
  quote: string;
  /** Page-local offsets — the same frame extracted_values.source_start uses. */
  charStart: number | null;
  charEnd: number | null;
  /** Null for formats with no geometry; the viewer falls back to the text. */
  boxes: NormalizedBox[] | null;
  /** Value sources only — the schema column the value belongs to. */
  column?: string;
}

/** Wire shape. Snake case to match every other API payload. */
export interface QueryCitation {
  kind: Source["kind"];
  document_id: number;
  filename: string;
  page: number;
  quote: string;
  char_start: number | null;
  char_end: number | null;
  boxes: NormalizedBox[] | null;
  column?: string;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** What answering produces, before it is stored and given an id. */
export interface AnswerResult {
  content: string;
  citations: QueryCitation[];
  /**
   * True when sources were found but the answer cites none of them — the
   * model wrote prose the server cannot tie to anything. The client says so
   * rather than presenting it as grounded.
   */
  ungrounded: boolean;
}

/** One stored turn, as the client renders it. */
export interface ChatMessage extends AnswerResult {
  id: string;
  role: "user" | "assistant";
}

/** POST /api/query's response: the stored answer, and the session it joined. */
export interface QueryAnswer extends ChatMessage {
  role: "assistant";
  session_id: number;
}
