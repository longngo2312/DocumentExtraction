import type Database from "better-sqlite3";
import type { LlmRequest } from "../llms/dtos.js";
import { OllamaProvider } from "../llms/ollama.js";
import type {
  DocumentText,
  ExtractedValueRow,
} from "../models/extraction.model.js";
import { DOCUMENT_SUMMARY_SQL } from "../sql/documentSummary.sql.js";
import { DOCUMENT_TEXT_SQL } from "../sql/documentText.sql.js";
import { EXTRACTED_VALUES_SQL } from "../sql/extractedValues.sql.js";

/** Lower than extraction's: the field table and a ~500-token output share the window. */
const MAX_SUMMARY_CHARS = 10000;

const SYSTEM_PROMPT =
  "You summarize what a document contained and what the extraction found in " +
  "it.\n\n" +
  "Write for someone who has not read the document and is about to review the " +
  "extracted values.\n\n" +
  '- "overview": 2-4 sentences. What kind of document this is, who or what it ' +
  "is about, and what it covers.\n" +
  '- "key_findings": at most 5 short bullets. The conclusions a reader should ' +
  "draw from the extracted values — patterns, notable values, how fields " +
  "relate. Not a restatement of the field list. Name the field each finding " +
  "rests on.\n" +
  '- "caveats": at most 3 short bullets. What was missing, ambiguous, or low ' +
  "confidence, and what a reviewer should check by hand. Any field marked " +
  "CONTRADICTED or unsupported belongs here.\n\n" +
  "Base every statement on the document text and the extracted fields given " +
  "to you. Do not add outside knowledge. If a field was not found, say so in " +
  "caveats rather than speculating about its value.";

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    key_findings: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: ["overview", "key_findings", "caveats"],
  additionalProperties: false,
};

/**
 * One line per field. Quotes are deliberately left out — they are already in the
 * document text below and cost ~40 tokens each. The support verdict IS included,
 * so the summary can be honest about what is shaky.
 */
function buildFieldTable(rows: ExtractedValueRow[]): string {
  const lines = rows.map((row) => {
    const value = row.value_text ?? row.llm_value;
    if (!value) return `- ${row.column_name}: (not found)`;

    const notes: string[] = [];
    if (row.basis) notes.push(row.basis);
    if (row.llm_confidence !== null) notes.push(row.llm_confidence.toFixed(2));
    if (row.support) {
      // Upper-cased so the two verdicts that matter survive a skim by a 7B.
      const flagged =
        row.support === "contradicted" || row.support === "unsupported";
      notes.push(
        `evidence: ${flagged ? row.support.toUpperCase() : row.support}`,
      );
    }

    return notes.length
      ? `- ${row.column_name}: ${value} (${notes.join(", ")})`
      : `- ${row.column_name}: ${value}`;
  });

  return ["Extracted fields:", ...lines].join("\n");
}

function readStrings(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .slice(0, limit);
}

export async function summarizeDocument(
  db: Database.Database,
  documentId: number,
): Promise<void> {
  const parsedText = db
    .prepare(DOCUMENT_TEXT_SQL.getByDocumentId)
    .get(documentId) as DocumentText | undefined;

  if (!parsedText) return;

  const rows = db
    .prepare(EXTRACTED_VALUES_SQL.getByDocument)
    .all(documentId) as ExtractedValueRow[];

  const inputText = parsedText.text.slice(0, MAX_SUMMARY_CHARS);

  const request: LlmRequest = {
    system: SYSTEM_PROMPT,
    prompt: [
      buildFieldTable(rows),
      "",
      "Document:",
      '"""',
      inputText,
      '"""',
      "",
      "Write the overview, at most 5 key findings, and at most 3 caveats.",
    ].join("\n"),
    schema: SUMMARY_SCHEMA,
    // The warmth is deliberate: temperature 0 summarization is flat and
    // repetitive. Everything else in this pipeline stays at 0.
    options: { num_predict: 700, temperature: 0.2 },
  };

  const result = await OllamaProvider.complete(request);
  if (typeof result !== "object" || result === null) return;

  const { overview, key_findings, caveats } = result as Record<string, unknown>;
  if (typeof overview !== "string" || overview.trim() === "") return;

  // maxItems does not reliably survive Ollama's schema-to-GBNF conversion, so the
  // limit is enforced here as well as asked for in the prompt.
  db.prepare(DOCUMENT_SUMMARY_SQL.upsert).run(
    documentId,
    overview.trim(),
    JSON.stringify(readStrings(key_findings, 5)),
    JSON.stringify(readStrings(caveats, 3)),
    OllamaProvider.model,
    // The real number, not MAX_SUMMARY_CHARS: when a summary reads thin the
    // first question is whether it saw the whole document.
    inputText.length,
  );
}
