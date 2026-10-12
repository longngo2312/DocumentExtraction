import {
  DocumentListItem,
  DocumentRecord,
} from "../../document/models/document.model.js";
import type {
  NormalizedBox,
  ParsedSpan,
} from "../../parsing/types.js";
import type { SchemaColumns } from "../../schema/models/schema.model.js";

export interface DocumentText {
  document_id: number;
  text: string;
  pages_json: string; // JSON.stringify(ReviewPage[]) — parse before use
  /**
   * JSON.stringify(PageSpans[]). Absent on rows read through
   * getPagesForReview, which deliberately does not select it.
   */
  spans_json: string;
  page_count: number;
  char_count: number;
  method: string;
  parsed_at: string;
}

/** One page's geometry, as stored in parsedDocumentText.spans_json. */
export interface PageSpans {
  page: number;
  width: number;
  height: number;
  spans: ParsedSpan[];
}

export type ReviewStatus = "unreviewed" | "accepted" | "edited" | "rejected";

export type MatchKind = "exact" | "normalized" | "none";

/** How the model arrived at a value. Routes a field into the grounding check. */
export type Basis = "stated" | "inferred" | "absent";

/** The grounding check's verdict on whether a quote establishes its answer. */
export type Support = "entailed" | "partial" | "unsupported" | "contradicted";

export interface ExtractedValue {
  id: number;
  document_id: number;
  column_id: number;
  llm_value: string | null;
  llm_quote: string | null;
  llm_confidence: number | null;
  llm_reasoning: string | null;
  basis: Basis | null;
  support: Support | null;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  source_page: number | null;
  source_start: number | null;
  source_end: number | null;
  source_span_ids: string | null; // JSON number[] — raw from SELECT *
  source_boxes: string | null; // JSON NormalizedBox[] — raw from SELECT *
  match_kind: MatchKind | null;
  confidence: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
}

export interface ExtractedValueRow extends ExtractedValue {
  column_name: string;
  data_type: SchemaColumns["data_type"];
  position: number;
}

export interface ExtractedDocument {
  document_id: number;
  status: DocumentRecord["status"];
  value: ExtractedValueRow[];
}
export interface SchemaJson {
  schema: Record<string, unknown>;
  keyToColumnId: Map<string, number>;
  /** Columns that have a description: the model answers it and derives a value. */
  derivedFields: string[];
  /** Columns with no description: the model copies the literal value. */
  verbatimFields: string[];
}

export interface LlmFieldAnswer {
  value: string | null;
  quote: string | null;
  page: number | null;
  /** The model's own 0..1, conditioned on its quote. Null when it omitted or garbled it. */
  confidence: number | null;
  basis: Basis | null;
  reasoning: string | null;
}

/**
 * One inferred conclusion, ready for the grounding check.
 *
 * Deliberately carries no document text — the isolation the check depends on is
 * enforced by what this type can hold.
 */
export interface GroundingClaim {
  columnId: number;
  /** The column description — the question the client actually asked. */
  question: string;
  /** The conclusion the model reached. */
  value: string;
  /** The verbatim evidence it cited. */
  quote: string;
}

/** What extraction hands the worker, so grounding does not have to re-query. */
export interface ExtractionOutcome {
  claims: GroundingClaim[];
}

/** Raw DB shape — key_findings/caveats are JSON strings straight from SELECT. */
export interface DocumentSummaryRow {
  document_id: number;
  overview: string;
  key_findings: string;
  caveats: string;
  model: string;
  input_chars: number;
  generated_at: string;
}

/** API shape — arrays parsed. Two types because every JSON-in-TEXT column in this
 * codebase has produced an "it came back as a string" bug at least once. */
export interface DocumentSummary {
  overview: string;
  key_findings: string[];
  caveats: string[];
  model: string;
  input_chars: number;
  generated_at: string;
}

// --- Review types (for the split-panel review API) ---

export interface ReviewField {
  column_id: number;
  name: string;
  data_type: SchemaColumns["data_type"];
  enum_options: string[] | null;
  llm_value: string | null;
  llm_quote: string | null;
  /** How strongly the model thinks its own quote supports this answer, 0..1. */
  llm_confidence: number | null;
  /** One sentence naming the evidence and the step taken from it. */
  llm_reasoning: string | null;
  basis: Basis | null;
  /**
   * The grounding check's verdict. Null means it did not run — an unverified
   * inference, NOT a passing one. The UI must say "not verified".
   */
  support: Support | null;
  value_text: string | null;
  source_page: number | null;
  // Index into the matching ReviewPage.text, so the text viewer can slice the
  // quote out directly. Null whenever match_kind is "none".
  source_start: number | null;
  source_end: number | null;
  /**
   * Normalized 0..1 rects, one per line, ready to draw. Null for formats with
   * no geometry — office and plain text — which is what puts the client on its
   * search fallback rather than leaving it with an empty highlight.
   */
  source_boxes: NormalizedBox[] | null;
  /** Span identity, so geometry can be re-derived without re-running the match. */
  source_span_ids: number[] | null;
  match_kind: MatchKind | null;
  confidence: number | null;
  review_status: ReviewStatus;
}

export interface ReviewPage {
  page: number;
  source: "text" | "ocr";
  text: string;
  /** Human name for the unit when "page N" is wrong: "Q3 Actuals", "Slide 4". */
  label?: string;
}

export interface ReviewPayload {
  document: DocumentListItem;
  pages: ReviewPage[];
  fields: ReviewField[];
  /** Null when the summary call failed or has not run — a real, renderable state. */
  summary: DocumentSummary | null;
}

export interface ReviewEdit {
  column_id: number;
  value: string | null;
}
