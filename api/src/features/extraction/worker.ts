import type Database from "better-sqlite3";
import { getTenantDb } from "../../db/tenantDb.js";
import type {
  DocumentRecord,
  ExtractionJob,
} from "../document/models/document.model.js";
import { DOCUMENT_SQL } from "../document/sqls/document.sql.js";
import { resolveStoragePath } from "../document/utils/storage.util.js";
import { ParsingError, parsedDocument } from "../parsing/index.js";
import { indexDocument } from "../RAG/services/indexing.service.js";
import {
  claimNextJob,
  completeJob,
  completeParseJob,
  failJob,
  recoverStaleJobs,
} from "./queue/jobQueue.js";
import { extractDocument } from "./services/extraction.service.js";
import { runGrounding } from "./services/grounding.service.js";
import { summarizeDocument } from "./services/summary.service.js";
import { DOCUMENT_TEXT_SQL } from "./sql/documentText.sql.js";

/**
 * Two slots, so an index job runs alongside an extraction instead of queueing
 * behind it — which is what keeps search invisible to the user. Two extractions
 * in the slots at once is harmless: unless Ollama runs with OLLAMA_NUM_PARALLEL=2
 * it just serialises them itself.
 *
 * ponytail: global FIFO across tenants. One user's bulk upload still occupies
 * both slots; per-user caps in the claim query when a second user notices.
 */
const MAX_IN_FLIGHT = 2;
let inFlight = 0;

async function slot(): Promise<void> {
  try {
    let job = claimNextJob();
    while (job) {
      await runJob(job);
      job = claimNextJob();
    }
  } catch (error) {
    // runJob handles its own failures, so anything landing here is queue-level
    // (bad SQL, admin DB locked). Swallow it — an unhandled rejection out of
    // `void slot()` would take the whole API down. The next tick retries.
    console.error("[worker] slot failed:", error);
  } finally {
    inFlight--;
  }
}

/**
 * Fill every free slot. A slot that finds the queue empty exits at once, so
 * over-spawning costs one claim query. Claims are synchronous, so two slots in
 * this one process can never take the same job.
 *
 * The free count is read once, up front, on purpose. A slot with nothing to
 * claim never reaches an `await`, so it runs to its `finally` and decrements
 * inFlight before `void slot()` even returns — a `while (inFlight < MAX)` loop
 * would therefore never end, and the first idle tick would freeze the API.
 */
function tick(): void {
  const free = MAX_IN_FLIGHT - inFlight;
  for (let i = 0; i < free; i++) {
    inFlight++;
    void slot();
  }
}

export function notifyWorker(): void {
  tick();
}

export function startWorker(): void {
  const recovered = recoverStaleJobs();
  if (recovered > 0) console.log(`[worker] requeued ${recovered} stale job(s)`);
  setInterval(tick, 5000);
}

async function runJob(job: ExtractionJob): Promise<void> {
  // Opened inside the try so a tenant DB that won't open fails the job instead
  // of escaping into slot(). Declared out here so `finally` can still close it.
  let db: Database.Database | undefined;

  try {
    db = getTenantDb(Number(job.user_id));

    const document = db
      .prepare(DOCUMENT_SQL.getDocumentById)
      .get(job.document_id) as DocumentRecord | undefined;

    // A document deleted mid-job is not a failure — deleteDocument drops its
    // jobs, so this only loses a race with it. Failing here would burn all three
    // attempts and log an error for something the user asked for.
    if (!document) {
      completeJob(job.id);
      return;
    }

    if (job.job_type === "parse") {
      await runParse(db, job, document);
      // Not inside runParse: the follow-ups must be enqueued only after the
      // text is committed, and atomically with this job's completion.
      completeParseJob(job);
      notifyWorker();
    } else if (job.job_type === "extract") {
      await runExtract(db, job);
      completeJob(job.id);
    } else {
      const { chunks } = await indexDocument(db, job.user_id, job.document_id);
      console.log(`[worker] indexed document ${job.document_id}: ${chunks} chunk(s)`);
      completeJob(job.id);
    }
  } catch (error) {
    const permanent =
      (error instanceof ParsingError &&
        (error.code === "unsupported" || error.code === "encrypted")) ||
      (error as { permanent?: boolean })?.permanent === true;
    const message = error instanceof Error ? error.message : String(error);

    const outcome = failJob(job.id, message, permanent);
    console.error(`[worker] ${job.job_type} job ${job.id} → ${outcome}: ${message}`);

    // Index failures stay on the job row. The document's status describes
    // extraction, and a document that extracted fine is fine — it is just not
    // searchable yet, which the query page reports on its own.
    if (outcome === "failed" && job.job_type !== "index") {
      db?.prepare(DOCUMENT_SQL.updateStatus).run("failed", job.document_id);
    }
  } finally {
    db?.close();
  }
}

/** File → parsedDocumentText. Extract and index both read from here. */
async function runParse(
  db: Database.Database,
  job: ExtractionJob,
  document: DocumentRecord,
): Promise<void> {
  db.prepare(DOCUMENT_SQL.updateStatus).run("processing", job.document_id);

  const parsed = await parsedDocument(
    resolveStoragePath(document.storage_path),
    document.mime_type,
  );

  // Narrowed on purpose. pages_json is what the review payload ships to the
  // browser, so the spans go into their own column — JSON.stringify(parsed.pages)
  // would put ~1MB of geometry back into the request this split exists to keep
  // it out of.
  const pagesJson = JSON.stringify(
    parsed.pages.map(({ page, text, source, label }) => ({
      page,
      text,
      source,
      label,
    })),
  );
  const spansJson = JSON.stringify(
    parsed.pages.map(({ page, width, height, spans }) => ({
      page,
      width,
      height,
      spans,
    })),
  );

  db.prepare(DOCUMENT_TEXT_SQL.upsert).run(
    job.document_id,
    parsed.text,
    pagesJson,
    spansJson,
    parsed.pageCount,
    parsed.charCount,
    parsed.method,
  );
}

/** Stored text → extracted values, grounding verdicts and a summary. */
async function runExtract(
  db: Database.Database,
  job: ExtractionJob,
): Promise<void> {
  db.prepare(DOCUMENT_SQL.updateStatus).run("processing", job.document_id);

  const outcome = await extractDocument(db, job.document_id);

  // Both of these are caught rather than allowed to fail the job, and that is
  // load-bearing: failJob requeues, and a requeued job re-runs extractDocument
  // from the top — so an uncaught throw here would re-pay ~90s of GPU time
  // three times over for work that already succeeded and is already committed.
  //
  // The cost is that a document can reach "extracted" with support NULL
  // everywhere and nothing on the row saying why. That is exactly why the
  // column is nullable and why the UI renders NULL as "not verified".
  try {
    await runGrounding(db, job.document_id, outcome.claims);
  } catch (error) {
    console.error(`[worker] grounding failed for ${job.document_id}:`, error);
  }

  try {
    await summarizeDocument(db, job.document_id);
  } catch (error) {
    console.error(`[worker] summary failed for ${job.document_id}:`, error);
  }

  db.prepare(DOCUMENT_SQL.updateStatus).run("extracted", job.document_id);
}
