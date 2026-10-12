import type Database from "better-sqlite3";
import { DocumentRecord } from "../../document/models/document.model.js";
import { DOCUMENT_SQL } from "../../document/sqls/document.sql.js";
import type { ParsedPage } from "../../parsing/types.js";
import { DocumentSchema, SchemaColumns } from "../../schema/models/schema.model.js";
import { SCHEMA_SQL } from "../../schema/sqls/schema.sql.js";
import { LlmRequest } from "../llms/dtos.js";
import { OllamaProvider } from "../llms/ollama.js";
import {
  DocumentText,
  ExtractionOutcome,
  GroundingClaim,
  LlmFieldAnswer,
  PageSpans,
} from "../models/extraction.model.js";
import { DOCUMENT_TEXT_SQL } from "../sql/documentText.sql.js";
import { EXTRACTED_VALUES_SQL } from "../sql/extractedValues.sql.js";
import { buildExtractionPrompt } from "../utils/buildPrompt.util.js";
import { coerce } from "../utils/coerce.util.js";
import { resolveQuote } from "../utils/resolveQuote.util.js";
import { schemaToJsonSchema } from "../utils/schemaToJsonSchema.util.js";

/**
 * Input shrinks as columns grow: each column costs ~110 output tokens, and
 * output and input share one 8192 window. 440 chars ≈ those 110 tokens.
 * Overflowing does not error — it truncates the JSON mid-object, which surfaces
 * as the parse error in ollama.ts.
 */
const BASE_INPUT_CHARS = 16000;
function inputBudget(columnCount: number): number {
  return Math.max(6000, BASE_INPUT_CHARS - Math.max(0, columnCount - 8) * 440);
}

const SYSTEM_PROMPT =
  "You extract structured data from documents and draw the specific " +
  "conclusions the schema asks for. Fields come in two groups, and the two " +
  "are answered differently.\n\n" +
  "QUESTIONS TO ANSWER — each of these carries a description. The description " +
  "is a question about the document, and it is authoritative. Work out the " +
  "answer and return the ANSWER, not the text you found it in. Answering may " +
  "take reading several parts of the document, counting, adding up, comparing " +
  "dates, or judging. Do that work and report the conclusion.\n" +
  '  Asked "how many years of professional experience does the candidate ' +
  'have", covering 2019-2023 and 2023-present, answer "6" — not the ' +
  "employment history you read it from.\n" +
  '  Asked "the amount the customer still owes", answer "420.00" — not the ' +
  '"Balance Payable: $420.00" line.\n' +
  "  The value must be short and direct: a number, a date, a name, a short " +
  "phrase. Never return a whole sentence, bullet, table row, or paragraph as " +
  "the value. That text belongs in the quote, never in the value.\n\n" +
  "VALUES TO COPY — these carry no description. Return the literal value " +
  "exactly as the document writes it. Do not reformat it, do not interpret " +
  "it, do not summarize it.\n\n" +
  "You are not being asked what is probably true about this subject. You are " +
  "being asked what THIS DOCUMENT establishes. Every conclusion must rest on " +
  "a passage you can point to.\n\n" +
  "For every field in both groups, return all six keys:\n" +
  '1. "value" — the answer. Null only if the document gives you nothing to ' +
  "work from.\n" +
  '2. "quote" — a passage copied from the document CHARACTER FOR CHARACTER. ' +
  "Never paraphrase, never clean it up, never fix a typo. If the value is " +
  "stated outright, quote where it is stated. If you reasoned to the value, " +
  "quote the passage you reasoned FROM — the specific facts, not a heading or " +
  "a job title. If several passages support the answer, quote the single most " +
  'important one. If you have no supporting passage, return null with basis "absent".\n' +
  '3. "page" — the page number the quote came from, read from the ' +
  '"--- page N ---" markers in the document. Content before the first marker ' +
  "is page 1.\n" +
  '4. "basis" — "stated" if the document says the answer directly, "inferred" ' +
  'if you concluded it from other facts, "absent" if the document does not ' +
  "support an answer.\n" +
  '5. "confidence" — a number from 0 to 1: how strongly does the passage you ' +
  "quoted support this exact answer? Judge the passage, not your overall " +
  "impression of the document. 0.9+ when the passage states the answer " +
  "outright. 0.5-0.7 when it clearly implies it. Below 0.3 when it is merely " +
  "suggestive. If you would not defend this answer using only the passage you " +
  "quoted, the confidence is below 0.5.\n" +
  '6. "reasoning" — one sentence, at most 20 words, naming the evidence and ' +
  'the step you took from it. Null when basis is "stated".\n\n' +
  "Two rules about conclusions:\n" +
  "- When the answer is a level, rank, band or category on a scale, choose " +
  "the LOWEST one the evidence actually establishes. Do not round up. Three " +
  "years of experience is not a staff engineer, however impressive the rest " +
  "of the document sounds.\n" +
  "- A conclusion that needs a fact the document never gives you is not a " +
  'conclusion. Return null with basis "absent" instead.\n\n' +
  "Match on meaning, not on wording: the document will usually not use the " +
  "same label as the field, and a label that merely looks similar to the " +
  "field key is not a match if its meaning is different.\n\n" +
  "Inventing a quote is the worst thing you can do. Stretching a real quote " +
  "past what it says is the second worst. A null value with basis \"absent\" " +
  "beats both.";

const BASIS_VALUES: ReadonlySet<string> = new Set([
  "stated",
  "inferred",
  "absent",
]);

/**
 * The model emits "0.85" as a string, or 85, or 1.2. Clamp rather than trust —
 * and keep null distinguishable from 0, which is why this returns null and not
 * a default.
 */
function readConfidence(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n > 1 && n <= 100 ? n / 100 : n));
}

function readAnswer(
  result: Record<string, unknown>,
  key: string,
): LlmFieldAnswer {
  // Defensive shape on purpose: a malformed field yields a safe empty answer
  // rather than throwing and failing the whole document over one bad key.
  const empty: LlmFieldAnswer = {
    value: null,
    quote: null,
    page: null,
    confidence: null,
    basis: null,
    reasoning: null,
  };
  const field = result[key];
  if (typeof field !== "object" || field === null) return empty;

  const obj = field as Record<string, unknown>;
  const value = typeof obj.value === "string" ? obj.value : null;
  const quote = typeof obj.quote === "string" ? obj.quote : null;
  const page =
    typeof obj.page === "number" && Number.isInteger(obj.page)
      ? obj.page
      : null;
  const basis =
    typeof obj.basis === "string" && BASIS_VALUES.has(obj.basis)
      ? (obj.basis as LlmFieldAnswer["basis"])
      : null;
  const reasoning =
    typeof obj.reasoning === "string" ? obj.reasoning.slice(0, 300) : null;

  return {
    value,
    quote,
    page,
    confidence: readConfidence(obj.confidence),
    basis,
    reasoning,
  };
}

export async function extractDocument(
  db: Database.Database,
  documentId: number,
): Promise<ExtractionOutcome> {
  //get parsed text from document
  const parsedText = db
    .prepare(DOCUMENT_TEXT_SQL.getByDocumentId)
    .get(documentId) as DocumentText | undefined;

  if (!parsedText) {
    throw new Error(`no parsed text for document ${documentId}`);
  }

  //get document record (original uploaded doc and a schemaId)
  const documentRecord = db.prepare(DOCUMENT_SQL.getById).get(documentId) as
    | DocumentRecord
    | undefined;

  if (!documentRecord) return { claims: [] };

  //the schema's own name/description frames what kind of document this is
  const schemaRecord = db
    .prepare(SCHEMA_SQL.getById)
    .get(documentRecord.schema_id) as DocumentSchema | undefined;

  //retrieve columns details
  const columns = db
    .prepare(SCHEMA_SQL.getColumnsBySchemaIdOrdered)
    .all(documentRecord.schema_id) as SchemaColumns[];

  if (columns.length === 0) return { claims: [] };

  //turn the columns details into json for llms
  const schemaJson = schemaToJsonSchema(columns);
  const inputText = parsedText.text.slice(0, inputBudget(columns.length));

  const request: LlmRequest = {
    system: SYSTEM_PROMPT,
    prompt: buildExtractionPrompt(schemaRecord, schemaJson, inputText),
    schema: schemaJson.schema,
    // Six keys per field instead of three — 2048 truncates around 12 columns.
    options: { num_predict: 3072 },
  };

  const result = (await OllamaProvider.complete(request)) as unknown;

  if (typeof result !== "object" || result === null) {
    throw new Error(`Ollama returned ${typeof result}, expected an object`);
  }

  const answers = result as Record<string, unknown>;
  const columnsById = new Map(columns.map((col) => [col.id, col]));
  const pages: ParsedPage[] = JSON.parse(parsedText.pages_json);

  // Geometry lives in its own column so the review payload can skip it.
  const pageSpans: PageSpans[] = JSON.parse(parsedText.spans_json);
  const spansByPage = new Map(pageSpans.map((p) => [p.page, p]));

  const upsert = db.prepare(EXTRACTED_VALUES_SQL.upsert);
  const claims: GroundingClaim[] = [];

  db.transaction(() => {
    for (const [key, columnId] of schemaJson.keyToColumnId) {
      const column = columnsById.get(columnId);
      if (!column) continue;

      const enumOptions: string[] | null = column.enum_options
        ? JSON.parse(column.enum_options)
        : null;

      const answer = readAnswer(answers, key);
      const coerced = coerce(answer.value, column.data_type, enumOptions);
      const location = resolveQuote(
        answer.quote,
        pages,
        answer.page,
        spansByPage,
      );

      // Deliberately NOT reconciled: if the model claimed basis "stated" but the
      // quote never resolved, both are stored as-is. Rewriting basis to "absent"
      // would erase the only trace of that disagreement.
      upsert.run(
        documentId,
        columnId,
        answer.value,
        answer.quote,
        answer.confidence,
        answer.reasoning,
        answer.basis,
        null, // support — the grounding check fills this in after the commit
        coerced.value_text,
        coerced.value_number,
        coerced.value_date,
        location.page,
        location.start,
        location.end,
        location.spanIds.length ? JSON.stringify(location.spanIds) : null,
        location.boxes.length ? JSON.stringify(location.boxes) : null,
        location.matchKind,
        location.confidence,
      );

      // Only inferred conclusions whose evidence actually exists. A stated field
      // is already checked by the quote match, and judging a quote that never
      // resolved would be rating a passage the document does not contain.
      if (
        answer.basis === "inferred" &&
        location.matchKind !== "none" &&
        answer.value &&
        answer.quote &&
        column.description?.trim()
      ) {
        claims.push({
          columnId,
          question: column.description.trim(),
          value: answer.value,
          quote: answer.quote,
        });
      }
    }
  })();

  return { claims };
}
