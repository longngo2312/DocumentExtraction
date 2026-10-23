/**
 * Runnable checks for the RAG defects that fail silently.
 *
 *   npx tsx src/features/RAG/rag.check.ts           # pure, nothing running
 *   npx tsx src/features/RAG/rag.check.ts --live    # + Ollama and Qdrant
 *
 * No framework on purpose. Each check guards something that would otherwise
 * surface only as a wrong highlight, a wrong number or another user's
 * document in an answer — long after the cause.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openTenantDB } from "../../db/tenantDb.js";
import type { ParsedPage } from "../parsing/types.js";
import { chunkPages } from "./ingestion/chunker.js";
import { validateRoute, verifyCitations } from "./services/answer.service.js";
import { queryValues } from "./services/values.service.js";

/**
 * The chunker's invariant. If it breaks, every citation highlights the wrong
 * text and nobody finds out until a reviewer does.
 */
function checkChunkSlices(): void {
  const sentence = "The supplier shall deliver the goods within thirty days. ";
  const pages: ParsedPage[] = [
    { page: 1, text: sentence.repeat(60), source: "text", spans: [], width: 1, height: 1 },
    { page: 2, text: `Short.\n\n${"Clause text continues here. ".repeat(80)}`, source: "text", spans: [], width: 1, height: 1 },
    { page: 3, text: "too short to index", source: "text", spans: [], width: 1, height: 1 },
  ];
  const chunks = chunkPages(pages, new Map());

  assert.ok(chunks.length > 2, "long pages should split into several chunks");
  for (const chunk of chunks) {
    assert.equal(
      pages[chunk.page - 1].text.slice(chunk.charStart, chunk.charEnd),
      chunk.text,
      `chunk ${chunk.chunkIndex} does not match its own offsets`,
    );
  }
  assert.ok(!chunks.some((c) => c.page === 3), "a sub-minimum page is skipped");
  assert.deepEqual(
    chunks.map((c) => c.chunkIndex),
    chunks.map((_, i) => i),
    "chunk_index is dense and 0-based across the document",
  );
  console.log(`ok  chunk slices (${chunks.length} chunks)`);
}

/** An invented [9] with five sources must never reach the client. */
function checkCitations(): void {
  const a = verifyCitations("Signed in May [2]. Total was $40 [9]. Renewal [2][4].", 5);
  assert.equal(a.text, "Signed in May [1]. Total was $40. Renewal [1][2].");
  assert.deepEqual(a.used, [1, 3], "renumbered in order of first use");

  const b = verifyCitations("Both apply [1, 3] and [2-3].", 3);
  assert.equal(b.text, "Both apply [1][2] and [3][2].");
  assert.deepEqual(b.used, [0, 2, 1]);

  const c = verifyCitations("Nothing valid [0] here [7].", 3);
  assert.equal(c.text, "Nothing valid here.");
  assert.deepEqual(c.used, []);

  const d = verifyCitations("Huge range [1-99999].", 3);
  assert.deepEqual(d.used, [], "an absurd range builds nothing");
  console.log("ok  citation verification");
}

/** Constrained decoding is not a security boundary. */
function checkRouteValidation(): void {
  const columns = [{ name: "invoice_total", data_type: "number" }];

  const good = validateRoute(
    { tool: "query_values", search_query: "totals", column: "INVOICE_TOTAL", op: "gt", value: "500" },
    "q",
    columns,
  );
  assert.equal(good.tool, "query_values");
  assert.deepEqual(good.values, { column: "invoice_total", op: "gt", value: "500" });

  const unknownColumn = validateRoute(
    { tool: "query_values", search_query: "x", column: "password_hash", op: "eq", value: "a" },
    "q",
    columns,
  );
  assert.equal(unknownColumn.tool, "search_passages", "unknown column degrades to search");
  assert.equal(unknownColumn.values, null);

  const badOp = validateRoute(
    { tool: "both", search_query: "x", column: "invoice_total", op: "; DROP TABLE", value: "1" },
    "q",
    columns,
  );
  assert.equal(badOp.tool, "search_passages");

  const garbage = validateRoute("not an object", "original question", columns);
  assert.equal(garbage.tool, "search_passages");
  assert.equal(garbage.searchQuery, "original question", "falls back to the question");
  console.log("ok  route validation");
}

/** Only reviewed values count, wildcards are literal, and the total is exact. */
function checkValueQuery(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-check-"));
  const db = openTenantDB(path.join(dir, "t.sqlite"));

  try {
    db.exec(`
      INSERT INTO document_schemas (id, name) VALUES (1, 'Invoices');
      INSERT INTO schema_columns (id, schema_id, name, data_type) VALUES
        (1, 1, 'vendor', 'text'), (2, 1, 'total', 'number');
    `);
    const doc = db.prepare(
      `INSERT INTO documents (id, schema_id, filename, mime_type, storage_path, size_bytes)
       VALUES (?, 1, ?, 'application/pdf', 'x', 1)`,
    );
    const value = db.prepare(
      `INSERT INTO extracted_values (document_id, column_id, value_text, value_number, review_status)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const rows: [number, string, string, number, string][] = [
      [1, "Acme Corp", "120", 120, "accepted"],
      [2, "Acme 100% Ltd", "900", 900, "edited"],
      [3, "Acme Unreviewed", "5000", 5000, "unreviewed"],
      [4, "Globex", "40", 40, "rejected"],
    ];
    for (const [id, vendor, totalText, total, status] of rows) {
      doc.run(id, `invoice-${id}.pdf`);
      value.run(id, 1, vendor, null, status);
      value.run(id, 2, totalText, total, status);
    }

    const acme = queryValues(db, { column: "vendor", op: "contains", value: "acme" });
    assert.equal(acme.sources.length, 2, "unreviewed and rejected values are excluded");

    const literalPercent = queryValues(db, { column: "vendor", op: "contains", value: "100%" });
    assert.equal(literalPercent.sources.length, 1, "% is matched literally, not as a wildcard");

    const big = queryValues(db, { column: "total", op: "gt", value: "$100" });
    assert.deepEqual(
      big.sources.map((s) => s.filename).sort(),
      ["invoice-1.pdf", "invoice-2.pdf"],
    );
    assert.match(big.summary, /2 documents match/);

    const notComparable = queryValues(db, { column: "total", op: "gt", value: "a lot" });
    assert.equal(notComparable.sources.length, 0);
    assert.match(notComparable.summary, /not a number/);

    // coerce() stores a date in value_date only, with value_text null.
    db.exec(`
      INSERT INTO schema_columns (id, schema_id, name, data_type) VALUES (3, 1, 'due', 'date');
      INSERT INTO extracted_values (document_id, column_id, value_date, review_status)
        VALUES (1, 3, '2026-03-01', 'accepted'), (2, 3, '2026-09-15', 'accepted');
    `);
    const late = queryValues(db, { column: "due", op: "gt", value: "2026-06-01" });
    assert.deepEqual(late.sources.map((s) => s.documentId), [2], "dates compare via value_date");
    assert.equal(late.sources[0].text, "due: 2026-09-15", "a date-only value still has text");
    assert.equal(
      queryValues(db, { column: "due", op: "any", value: "" }).sources.length,
      2,
      "a date-only value is not treated as missing",
    );

    const scoped = queryValues(db, { column: "vendor", op: "any", value: "" }, 2);
    assert.deepEqual(scoped.sources.map((s) => s.documentId), [2], "document scope applies");
    console.log("ok  value query");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Index → retrieve → answer against the real Ollama and Qdrant. Uses a temp
 * tenant DB and tenant ids no real account will have, and removes its own
 * points afterwards. ~30s, mostly the answer generation.
 */
async function checkLive(): Promise<void> {
  const { indexDocument } = await import("./services/indexing.service.js");
  const { answerQuestion, REFUSAL } = await import("./services/answer.service.js");
  const { deleteDocumentPoints } = await import("./vector/qdrant.js");

  const OWNER = 900_001;
  const STRANGER = 900_002;
  const countPoints = async (tenant: number) => {
    const res = await fetch(
      "http://localhost:6333/collections/document_chunks/points/count",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          exact: true,
          filter: { must: [{ key: "tenant", match: { value: `user_${tenant}` } }] },
        }),
      },
    );
    return ((await res.json()) as { result: { count: number } }).result.count;
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-live-"));
  const db = openTenantDB(path.join(dir, "t.sqlite"));
  try {
    const pages = [
      {
        page: 1,
        text:
          "MASTER SERVICES AGREEMENT. This agreement is made between Northwind Traders " +
          "and Contoso Logistics. Contoso Logistics will provide warehousing and freight " +
          "services for Northwind Traders across the Pacific Northwest region.",
        source: "text",
        label: undefined,
      },
      {
        page: 2,
        text:
          "TERMINATION. Either party may terminate this agreement with ninety (90) days " +
          "written notice. Northwind Traders may terminate immediately if Contoso Logistics " +
          "fails to meet the agreed delivery windows in three consecutive months.",
        source: "text",
        label: undefined,
      },
    ];
    // The column invites the router to answer "how much notice" as a value
    // lookup, and there are no reviewed values — so the answer below only
    // passes if a zero-match lookup falls back to searching the text.
    db.exec(`
      INSERT INTO document_schemas (id, name) VALUES (1, 'Contracts');
      INSERT INTO schema_columns (id, schema_id, name, description, data_type)
        VALUES (1, 1, 'notice_period_days', 'Days of written notice required to terminate', 'number');
      INSERT INTO documents (id, schema_id, filename, mime_type, storage_path, size_bytes)
        VALUES (1, 1, 'msa-northwind.txt', 'text/plain', 'x', 1);
    `);
    db.prepare(
      `INSERT INTO parsedDocumentText (document_id, text, pages_json, spans_json, page_count, char_count, method)
       VALUES (1, ?, ?, '[]', 2, ?, 'text')`,
    ).run(pages.map((p) => p.text).join("\n"), JSON.stringify(pages), 400);

    const first = await indexDocument(db, OWNER, 1);
    const pointsAfterFirst = await countPoints(OWNER);
    await indexDocument(db, OWNER, 1);
    assert.equal(await countPoints(OWNER), pointsAfterFirst, "re-index does not duplicate points");
    assert.equal(pointsAfterFirst, first.chunks, "one point per chunk");
    console.log(`ok  index is idempotent (${first.chunks} chunks, ${pointsAfterFirst} points)`);

    const answer = await answerQuestion(db, OWNER, "How much notice is needed to terminate?", []);
    console.log(`    answer: ${answer.content.slice(0, 160)}`);
    assert.ok(answer.citations.length > 0, "an answerable question cites a source");
    assert.ok(answer.citations.every((c) => c.document_id === 1));
    assert.equal(answer.citations[0].page, 2, "the termination clause is on page 2");
    const c = answer.citations[0];
    assert.equal(pages[c.page - 1].text.slice(c.char_start!, c.char_end!), c.quote,
      "citation offsets point at exactly the quoted text");
    console.log("ok  answer cites the right page and offsets");

    // Either the refusal line, or — if the router tried a value lookup — the
    // zero-match summary. Both are honest; an answer with content is not.
    const declines = (text: string) =>
      text.includes(REFUSAL.slice(0, 30)) || /\b0 documents match\b/.test(text);

    const offTopic = await answerQuestion(db, OWNER, "What is the boiling point of mercury?", []);
    assert.equal(offTopic.citations.length, 0);
    assert.ok(declines(offTopic.content), `declines, got: ${offTopic.content}`);
    console.log("ok  off-corpus question is refused");

    const leak = await answerQuestion(db, STRANGER, "How much notice is needed to terminate?", []);
    assert.equal(leak.citations.length, 0, "another tenant retrieves nothing");
    assert.ok(!/ninety|\b90\b/i.test(leak.content), `owner's content leaked: ${leak.content}`);
    assert.ok(declines(leak.content), `declines, got: ${leak.content}`);
    console.log("ok  tenant isolation holds");

    await deleteDocumentPoints(OWNER, 1);
    assert.equal(await countPoints(OWNER), 0, "delete removes every point");
    console.log("ok  delete reaches Qdrant");
  } finally {
    await deleteDocumentPoints(OWNER, 1).catch(() => {});
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

checkChunkSlices();
checkCitations();
checkRouteValidation();
checkValueQuery();
if (process.argv.includes("--live")) await checkLive();
console.log("\nall RAG checks passed");
