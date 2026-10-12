import type { ReviewField, ReviewStatus } from "../types";

/**
 * The one string the reviewer reads for a field.
 *
 * The server keeps the typed columns (value_number, value_date) for querying,
 * but only ever sends value_text to the review UI — for numbers that is the
 * document's own formatting, which is what a reviewer needs to compare against
 * the page. Null means the model found nothing.
 */
export function displayValue(field: ReviewField): string | null {
  return field.value_text;
}

/** "true"/"false" is how coerce() stores booleans — value_text, not an integer. */
export function booleanLabel(value: string): string {
  return value === "true" ? "True" : "False";
}

/** 0.9 -> "90%". Null confidence means the quote step found nothing. */
export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return "—";
  return `${Math.round(confidence * 100)}%`;
}

/** Whether a field has a quote the viewer could actually navigate to. */
export function hasLocatableQuote(field: ReviewField): boolean {
  return Boolean(field.llm_quote) && field.match_kind !== "none";
}

/**
 * Bands, not percentages. A 7B's self-reported float is not calibrated to two
 * digits — rendering "82%" implies a precision it does not have.
 */
export function confidenceBand(
  confidence: number | null,
): "high" | "medium" | "low" | null {
  if (confidence === null) return null;
  return confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";
}

export type Flag = "fabricated" | "contradicted" | "unsupported" | "unverified";

/**
 * The two hallucinations, named separately because they need different reactions:
 * "fabricated" means the quote is not in the document at all, "contradicted"
 * means the quote is real and says something other than the answer drawn from it.
 *
 * Ordered by severity — the first match wins.
 */
export function flagFor(field: ReviewField): Flag | null {
  // A quote that did not resolve, asserted confidently. Low confidence on an
  // unresolved quote is the model correctly hedging, which is not a flag.
  if (field.match_kind === "none" && (field.llm_confidence ?? 0) >= 0.8) {
    return "fabricated";
  }
  if (field.support === "contradicted") return "contradicted";
  if (field.support === "unsupported") return "unsupported";
  // Inferred, but the grounding call never ran. NOT the same as passing it.
  if (field.basis === "inferred" && field.support === null) return "unverified";
  return null;
}

/** Fields carrying a flag, for the badge on the Fields tab. */
export function countFlagged(fields: ReviewField[]): number {
  return fields.filter((field) => flagFor(field) !== null).length;
}

/**
 * Fields the reviewer has ruled on — either saved earlier, or pending in this
 * session. Drives the progress bar and gates the save button.
 */
export function countDecided(
  fields: ReviewField[],
  edits: Map<number, string | null>,
): number {
  return fields.filter(
    (field) =>
      edits.has(field.column_id) || field.review_status !== "unreviewed",
  ).length;
}

/**
 * The review_status the server will derive for a pending edit.
 *
 * Mirrors review.service.ts exactly, so the chip a reviewer sees before saving
 * matches what comes back after. Note the comparison is against llm_value — the
 * raw model answer — not the displayed value_text.
 */
export function projectStatus(
  field: ReviewField,
  edit: string | null | undefined,
): ReviewStatus {
  if (edit === undefined) return field.review_status;
  if (edit === null || edit === "") return "rejected";
  return edit === field.llm_value ? "accepted" : "edited";
}
