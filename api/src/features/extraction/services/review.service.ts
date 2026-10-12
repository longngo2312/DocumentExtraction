import { getTenantDb } from "../../../db/tenantDb.js";
import type { DocumentListItem } from "../../document/models/document.model.js";
import { DOCUMENT_SQL } from "../../document/sqls/document.sql.js";
import type { ParsedPage } from "../../parsing/types.js";
import type { SchemaColumns } from "../../schema/models/schema.model.js";
import type {
  DocumentSummary,
  DocumentSummaryRow,
  DocumentText,
  ReviewEdit,
  ReviewField,
  ReviewPayload,
} from "../models/extraction.model.js";
import { DOCUMENT_SUMMARY_SQL } from "../sql/documentSummary.sql.js";
import { DOCUMENT_TEXT_SQL } from "../sql/documentText.sql.js";
import { EXTRACTED_VALUES_SQL } from "../sql/extractedValues.sql.js";
import { coerce } from "../utils/coerce.util.js";

interface ReviewFieldRow {
  column_id: number;
  name: string;
  data_type: SchemaColumns["data_type"];
  enum_options: string | null;
  llm_value: string | null;
  llm_quote: string | null;
  llm_confidence: number | null;
  llm_reasoning: string | null;
  basis: string | null;
  support: string | null;
  value_text: string | null;
  source_page: number | null;
  source_start: number | null;
  source_end: number | null;
  source_boxes: string | null;
  source_span_ids: string | null;
  match_kind: string | null;
  confidence: number | null;
  review_status: string;
}

export function getReviewPayload(
  userId: number,
  documentId: number,
): ReviewPayload | undefined {
  const db = getTenantDb(userId);

  const document = db.prepare(DOCUMENT_SQL.getDocumentById).get(documentId) as
    | DocumentListItem
    | undefined;
  if (!document) return undefined;

  // Not getByDocumentId: that is SELECT * and would ship spans_json — roughly
  // 1MB on a 20-page PDF — to the browser on every review load.
  const parsedText = db
    .prepare(DOCUMENT_TEXT_SQL.getPagesForReview)
    .get(documentId) as Omit<DocumentText, "spans_json"> | undefined;

  const pages: ParsedPage[] = parsedText
    ? JSON.parse(parsedText.pages_json)
    : [];

  const rows = db
    .prepare(EXTRACTED_VALUES_SQL.getForReview)
    .all(documentId) as ReviewFieldRow[];

  const fields: ReviewField[] = rows.map((row) => ({
    column_id: row.column_id,
    name: row.name,
    data_type: row.data_type,
    enum_options: row.enum_options ? JSON.parse(row.enum_options) : null,
    llm_value: row.llm_value,
    llm_quote: row.llm_quote,
    llm_confidence: row.llm_confidence,
    llm_reasoning: row.llm_reasoning,
    basis: row.basis as ReviewField["basis"],
    support: row.support as ReviewField["support"],
    value_text: row.value_text,
    source_page: row.source_page,
    source_start: row.source_start,
    source_end: row.source_end,
    source_boxes: row.source_boxes ? JSON.parse(row.source_boxes) : null,
    source_span_ids: row.source_span_ids
      ? JSON.parse(row.source_span_ids)
      : null,
    match_kind: row.match_kind as ReviewField["match_kind"],
    confidence: row.confidence,
    review_status: row.review_status as ReviewField["review_status"],
  }));

  // Rides the existing payload (~1KB) rather than a second endpoint: another
  // fetch would buy another loading state and nothing else.
  const summaryRow = db
    .prepare(DOCUMENT_SUMMARY_SQL.getByDocumentId)
    .get(documentId) as DocumentSummaryRow | undefined;

  const summary: DocumentSummary | null = summaryRow
    ? {
        overview: summaryRow.overview,
        // TEXT columns holding JSON — parse at the boundary, never hand the
        // client the raw string.
        key_findings: JSON.parse(summaryRow.key_findings),
        caveats: JSON.parse(summaryRow.caveats),
        model: summaryRow.model,
        input_chars: summaryRow.input_chars,
        generated_at: summaryRow.generated_at,
      }
    : null;

  return {
    document,
    pages: pages.map((p) => ({
      page: p.page,
      source: p.source,
      text: p.text,
      label: p.label,
    })),
    fields,
    summary,
  };
}

export function saveReview(
  userId: number,
  documentId: number,
  edits: ReviewEdit[],
): void {
  const db = getTenantDb(userId);

  const document = db.prepare(DOCUMENT_SQL.getDocumentById).get(documentId) as
    | DocumentListItem
    | undefined;
  if (!document) {
    throw new Error("Document not found");
  }

  // Load current extracted values to compare for review_status derivation
  const currentRows = db
    .prepare(EXTRACTED_VALUES_SQL.getForReview)
    .all(documentId) as ReviewFieldRow[];

  const currentByColumnId = new Map(
    currentRows.map((r) => [r.column_id, r]),
  );

  const updateStmt = db.prepare(EXTRACTED_VALUES_SQL.updateReviewedValue);
  const updateStatus = db.prepare(DOCUMENT_SQL.updateStatus);

  db.transaction(() => {
    for (const edit of edits) {
      const current = currentByColumnId.get(edit.column_id);
      if (!current) continue;

      const enumOptions: string[] | null = current.enum_options
        ? JSON.parse(current.enum_options)
        : null;

      // Derive review_status server-side from comparison with llm_value
      let reviewStatus: "accepted" | "edited" | "rejected";
      if (edit.value === null || edit.value === "") {
        reviewStatus = "rejected";
      } else if (edit.value === current.llm_value) {
        reviewStatus = "accepted";
      } else {
        reviewStatus = "edited";
      }

      const coerced = coerce(
        reviewStatus === "rejected" ? null : edit.value,
        current.data_type,
        enumOptions,
      );

      updateStmt.run(
        coerced.value_text,
        coerced.value_number,
        coerced.value_date,
        reviewStatus,
        documentId,
        edit.column_id,
      );
    }

    updateStatus.run("reviewed", documentId);
  })();
}