import type { DocumentSchema } from "../../schema/models/schema.model.js";
import type { SchemaJson } from "../models/extraction.model.js";

/**
 * Assembles the user message: document-type context, the field list split by
 * mode, the document, then a one-line restatement of the task.
 *
 * The two field sections are separate rather than one list because a 7B model
 * will not reliably notice that "this field has a description, therefore I
 * should answer it instead of copying" — the section header has to say so.
 *
 * The restatement after the document is deliberate. The document runs to
 * MAX_INPUT_CHARS, so without it the instructions sit thousands of tokens
 * upstream of where the model starts generating.
 */
export function buildExtractionPrompt(
  schema: DocumentSchema | undefined,
  schemaJson: Pick<SchemaJson, "derivedFields" | "verbatimFields">,
  inputText: string,
): string {
  const sections: string[] = [];

  // Document-type framing disambiguates fields that are ambiguous on their own
  // — "total" means something different on an invoice than on a lab report.
  if (schema?.name) {
    const context = [`Document type: ${schema.name}`];
    if (schema.description) context.push(schema.description);
    sections.push(context.join("\n"));
  }

  if (schemaJson.derivedFields.length) {
    sections.push(
      [
        "QUESTIONS TO ANSWER — for each of these, work out the answer from the " +
          "document and return the answer itself, not the text you found it in:",
        schemaJson.derivedFields.join("\n"),
      ].join("\n"),
    );
  }

  if (schemaJson.verbatimFields.length) {
    sections.push(
      [
        "VALUES TO COPY — for each of these, return the literal value exactly " +
          "as the document writes it:",
        schemaJson.verbatimFields.join("\n"),
      ].join("\n"),
    );
  }

  sections.push(["Document:", '"""', inputText, '"""'].join("\n"));

  const closing = schemaJson.derivedFields.length
    ? "Answer each question above with the answer itself — short and direct, " +
      "never the passage you read it from. Copy each literal value exactly. " +
      "Return null for anything the document does not support."
    : "Copy each value above exactly as the document writes it. Return null " +
      "for anything the document does not state.";
  sections.push(closing);

  return sections.join("\n\n");
}
