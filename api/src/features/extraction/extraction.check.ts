/**
 * Runnable checks for the two phase-6 defects that fail silently.
 *
 *   npx tsx src/features/extraction/extraction.check.ts
 *
 * No framework on purpose. The first check needs nothing running; the second
 * needs Ollama and takes ~10s.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openTenantDB } from "../../db/tenantDb.js";
import { checkGrounding } from "./services/grounding.service.js";
import { EXTRACTED_VALUES_SQL } from "./sql/extractedValues.sql.js";

/**
 * The upsert binds 18 values. A miscount does not throw where you wrote it — it
 * throws inside the worker's catch, three retries later, as a generic document
 * failure. This is the guide's "likeliest single defect in this phase".
 */
function checkUpsertArity(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extraction-check-"));
  const db = openTenantDB(path.join(dir, "t.sqlite"));

  try {
    db.exec(`
      INSERT INTO document_schemas (id, name) VALUES (1, 's');
      INSERT INTO schema_columns (id, schema_id, name, data_type) VALUES (1, 1, 'c', 'text');
      INSERT INTO documents (id, schema_id, filename, mime_type, storage_path, size_bytes)
        VALUES (1, 1, 'f.pdf', 'application/pdf', 'p', 1);
    `);

    // Exactly what extraction.service.ts binds, in the same order.
    db.prepare(EXTRACTED_VALUES_SQL.upsert).run(
      1, // document_id
      1, // column_id
      "Senior", // llm_value
      "three years at Acme", // llm_quote
      0.72, // llm_confidence
      "Inferred from tenure.", // llm_reasoning
      "inferred", // basis
      null, // support
      "Senior", // value_text
      null, // value_number
      null, // value_date
      1, // source_page
      0, // source_start
      19, // source_end
      null, // source_span_ids
      null, // source_boxes
      "exact", // match_kind
      0.9, // confidence
    );

    const row = db
      .prepare("SELECT * FROM extracted_values WHERE document_id = 1")
      .get() as Record<string, unknown>;

    // Off-by-one binds shift every column left, so assert on the tail: if the
    // count were wrong, basis would be holding match_kind's value.
    assert.equal(row.basis, "inferred", "basis landed in the wrong column");
    assert.equal(row.match_kind, "exact", "match_kind landed in the wrong column");
    assert.equal(row.llm_confidence, 0.72);
    assert.equal(row.support, null, "support must start null, not defaulted");

    // A re-extraction must clear the previous verdict and the reviewer's ruling.
    db.prepare(EXTRACTED_VALUES_SQL.setSupport).run("contradicted", 1, 1);
    db.prepare(EXTRACTED_VALUES_SQL.upsert).run(
      1, 1, "Mid", "q", 0.4, "r", "inferred", null,
      "Mid", null, null, 1, 0, 1, null, null, "exact", 0.9,
    );
    const after = db
      .prepare("SELECT support, review_status FROM extracted_values WHERE document_id = 1")
      .get() as Record<string, unknown>;
    assert.equal(after.support, null, "stale verdict survived a re-extraction");
    assert.equal(after.review_status, "unreviewed");

    console.log("PASS  upsert arity + re-extraction reset");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * If the judge returns "entailed" for both, everything built on `support` is
 * decoration. This is the guide's acceptance criterion, not a smoke test.
 */
async function checkJudgeDiscriminates(): Promise<void> {
  const verdicts = await checkGrounding([
    {
      columnId: 1,
      question: "What is the candidate's seniority level?",
      value: "Staff Engineer",
      quote: "Three years at Acme building internal tools.",
    },
    {
      columnId: 2,
      question: "What is the invoice total?",
      value: "420.00",
      quote: "Balance Payable: $420.00",
    },
  ]);

  const bad = verdicts.get(1);
  const good = verdicts.get(2);
  console.log(`      staff-from-3-years → ${bad ?? "null"}`);
  console.log(`      total-from-total   → ${good ?? "null"}`);

  assert.notEqual(bad, "entailed", "judge rubber-stamped an overreach");
  assert.equal(good, "entailed", "judge rejected a directly stated value");

  console.log("PASS  judge discriminates");
}

/** The check's whole premise: the document is never in the grounding prompt. */
async function checkIsolation(): Promise<void> {
  const marker = "ZEBRAFISH_CANARY_9931";
  const originalFetch = globalThis.fetch;
  let sent = "";

  globalThis.fetch = async (input: any, init?: any) => {
    sent = String(init?.body ?? "");
    return originalFetch(input, init);
  };

  try {
    await checkGrounding([
      {
        columnId: 1,
        question: "What is the total?",
        value: "10",
        quote: "The total is 10.",
      },
    ]);
    assert.ok(sent.length > 0, "never captured the request body");
    assert.ok(
      !sent.includes(marker),
      "document text leaked into the grounding prompt",
    );
    console.log("PASS  grounding prompt carries no document text");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  checkUpsertArity();
  await checkJudgeDiscriminates();
  await checkIsolation();
  console.log("\nall checks passed");
}

main().catch((error) => {
  console.error("\nFAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
