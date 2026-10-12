import type Database from "better-sqlite3";
import type { LlmRequest } from "../llms/dtos.js";
import { OllamaProvider } from "../llms/ollama.js";
import type { GroundingClaim, Support } from "../models/extraction.model.js";
import { EXTRACTED_VALUES_SQL } from "../sql/extractedValues.sql.js";

/**
 * Past 8 claims a 7B starts losing track of which item it is numbering, and the
 * verdicts drift onto the wrong claims. Cheaper to pay for a second call.
 */
const CLAIMS_PER_CALL = 8;

const SUPPORT_VALUES: ReadonlySet<string> = new Set([
  "entailed",
  "partial",
  "unsupported",
  "contradicted",
]);

/**
 * The isolation this check depends on is enforced by what the caller sends, not
 * by this instruction — the document is never in the prompt. The instruction
 * only stops the model filling the gap from its own priors.
 */
const SYSTEM_PROMPT =
  "You are checking whether a conclusion is justified by one piece of " +
  "evidence.\n\n" +
  "For each item you are given: the question that was asked, the answer that " +
  "was given, and one passage from a document.\n\n" +
  "Judge ONLY the passage. You are not being asked whether the answer is " +
  "true. You are being asked whether THIS PASSAGE establishes it. Ignore what " +
  "you know about the subject, the wider document, or the world.\n\n" +
  "Return one verdict per item:\n\n" +
  '- "entailed"     — the passage establishes the answer. A careful reader ' +
  "would reach the same answer from this passage alone.\n" +
  '- "partial"      — the passage points toward the answer but does not ' +
  "settle it.\n" +
  '- "unsupported"  — the passage is about the right subject but does not ' +
  "justify this specific answer.\n" +
  '- "contradicted" — the passage points to a different answer.\n\n' +
  'An answer that claims more than the passage shows is "contradicted", not ' +
  '"partial". If the passage shows three years of experience and the answer ' +
  'says "staff engineer", that is "contradicted".\n\n' +
  "Being generous here is a failure. If you have to add a fact of your own to " +
  'make the answer work, the verdict is "unsupported".';

const GROUNDING_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          support: {
            enum: ["entailed", "partial", "unsupported", "contradicted"],
          },
        },
        required: ["id", "support"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

/** Claims are numbered 1..N positionally — a 7B copying arbitrary column_ids is
 * a needless error surface, so the mapping back happens in TS. */
function buildPrompt(batch: GroundingClaim[]): string {
  const items = batch.map((claim, index) =>
    [
      `Item ${index + 1}`,
      `Question: ${claim.question}`,
      `Answer given: ${claim.value}`,
      `Passage: """${claim.quote}"""`,
    ].join("\n"),
  );

  return [
    `Judge these ${batch.length} item(s).`,
    "",
    items.join("\n\n"),
    "",
    `Return exactly ${batch.length} verdict(s), one per item, using the item ` +
      `number as "id".`,
  ].join("\n");
}

function readVerdicts(
  result: unknown,
  batch: GroundingClaim[],
): Map<number, Support> {
  const out = new Map<number, Support>();
  if (typeof result !== "object" || result === null) return out;

  const verdicts = (result as { verdicts?: unknown }).verdicts;
  if (!Array.isArray(verdicts)) return out;

  for (const entry of verdicts) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, support } = entry as { id?: unknown; support?: unknown };

    if (typeof id !== "number" || !Number.isInteger(id)) continue;
    if (typeof support !== "string" || !SUPPORT_VALUES.has(support)) continue;

    // 1-based, and a number outside the batch means the model invented an item.
    const claim = batch[id - 1];
    if (!claim) continue;

    out.set(claim.columnId, support as Support);
  }

  return out;
}

/**
 * Ask a model that has never seen the document whether each cited passage
 * actually establishes the answer drawn from it.
 *
 * A claim the model returns no verdict for stays absent from the map, and so
 * stays NULL in the database. Never default a missing verdict to "entailed" —
 * that would silently pass exactly the fields the model found hardest.
 */
export async function checkGrounding(
  claims: GroundingClaim[],
): Promise<Map<number, Support>> {
  const verdicts = new Map<number, Support>();

  for (let i = 0; i < claims.length; i += CLAIMS_PER_CALL) {
    const batch = claims.slice(i, i + CLAIMS_PER_CALL);

    const request: LlmRequest = {
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(batch),
      schema: GROUNDING_SCHEMA,
      options: { num_predict: 400, temperature: 0 },
    };

    const result = await OllamaProvider.complete(request);
    for (const [columnId, support] of readVerdicts(result, batch)) {
      verdicts.set(columnId, support);
    }
  }

  return verdicts;
}

/**
 * Run the check and record the verdicts.
 *
 * The verdict never changes the value — no auto-correction, no suppression, no
 * re-extraction. It is surfaced to the human at the review gate, which is the
 * only thing that decides.
 */
export async function runGrounding(
  db: Database.Database,
  documentId: number,
  claims: GroundingClaim[],
): Promise<void> {
  if (claims.length === 0) return;

  const verdicts = await checkGrounding(claims);
  if (verdicts.size === 0) return;

  const setSupport = db.prepare(EXTRACTED_VALUES_SQL.setSupport);

  db.transaction(() => {
    for (const [columnId, support] of verdicts) {
      setSupport.run(support, documentId, columnId);
    }
  })();
}
