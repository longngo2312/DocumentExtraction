import type { SchemaColumns } from "../../schema/models/schema.model.js";
import type { SchemaJson } from "../models/extraction.model.js";

function dedupeSlug(slug: string, used: Set<string>): string {
  if (!used.has(slug)) return slug;
  let suffix = 2;
  while (used.has(`${slug}_${suffix}`)) suffix++;
  return `${slug}_${suffix}`;
}

function slugify(name: string, used: Set<string>): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/#/g, "_number")
    .replace(/[^\w]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const slug = dedupeSlug(base, used);
  used.add(slug);
  return slug;
}


function buildFieldLine(
  slug: string,
  col: SchemaColumns,
  typeLabel: string,
  description: string,
): string {
  const head = `- ${slug} — "${col.name}" (${typeLabel})`;
  return description ? `${head}: ${description}` : head;
}

export function schemaToJsonSchema(columns: SchemaColumns[]): SchemaJson {
  const properties: Record<string, unknown> = {};
  const keyToColumnId = new Map<string, number>();
  const derivedFields: string[] = [];
  const verbatimFields: string[] = [];
  const usedSlugs = new Set<string>();
  const required: string[] = [];

  for (const col of columns) {
    const slug = slugify(col.name, usedSlugs);

    // A description turns the column into a question to answer rather than a
    // span to copy. The frontend defaults it to "", so trim before testing —
    // a whitespace-only description must not flip the field into derive mode.
    const description = col.description?.trim() ?? "";
    const target = description ? derivedFields : verbatimFields;

    // Every property is { value, quote, page, basis, confidence, reasoning }.
    // quote/page let the server verify the evidence exists; basis/confidence/
    // reasoning are what make an inference checkable rather than just asserted.
    const answerProps = {
      quote: { type: ["string", "null"] },
      page: { type: ["integer", "null"] },
      basis: { enum: ["stated", "inferred", "absent"] },
      confidence: { type: "number" },
      reasoning: { type: ["string", "null"] },
    };

    // Every key is required. Under constrained decoding an optional key is a key
    // the model skips, and `confidence` is the first to go — it is the hardest.
    const answerKeys = ["value", "quote", "page", "basis", "confidence", "reasoning"];

    if (col.data_type === "enum" && col.enum_options) {
      const options: string[] = JSON.parse(col.enum_options);
      properties[slug] = {
        type: "object",
        properties: { value: { enum: [...options, null] }, ...answerProps },
        required: answerKeys,
        additionalProperties: false,
      };

      const enumList = options.join(", ");
      target.push(buildFieldLine(slug, col, `enum: ${enumList}`, description));
    } else {
      properties[slug] = {
        type: "object",
        properties: { value: { type: ["string", "null"] }, ...answerProps },
        required: answerKeys,
        additionalProperties: false,
      };

      target.push(buildFieldLine(slug, col, col.data_type, description));
    }

    keyToColumnId.set(slug, col.id);
    required.push(slug);
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };

  return { schema, keyToColumnId, derivedFields, verbatimFields };
}
