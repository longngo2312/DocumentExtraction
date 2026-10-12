import { getTenantDb } from "../../db/tenantDb.js";
import type {
  DocumentRecord,
  ExtractionJob,
} from "../document/models/document.model.js";
import { DOCUMENT_SQL } from "../document/sqls/document.sql.js";
import { resolveStoragePath } from "../document/utils/storage.util.js";
import { ParsingError, parsedDocument } from "../parsing/index.js";
import {
  claimNextJob,
  completeJob,
  failJob,
  recoverStaleJobs,
} from "./queue/jobQueue.js";
import { extractDocument } from "./services/extraction.service.js";
import { runGrounding } from "./services/grounding.service.js";
import { summarizeDocument } from "./services/summary.service.js";
import { DOCUMENT_TEXT_SQL } from "./sql/documentText.sql.js";

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    let job = claimNextJob();
    while (job) {
      await runJob(job);
      job = claimNextJob();
    }
  } catch (error) {
    // runJob handles its own failures, so anything landing here is queue-level
    // (bad SQL, admin DB locked). Swallow it — an unhandled rejection out of
    // `void tick()` would take the whole API down. The next tick retries.
    console.error("[worker] tick failed:", error);
  } finally {
    ticking = false;
  }
}

export function notifyWorker(): void {
  void tick();
}

export function startWorker(): void {
  const recovered = recoverStaleJobs();
  if (recovered > 0) console.log(`[worker] requeued ${recovered} stale job(s)`);
  setInterval(() => void tick(), 5000);
}

async function runJob(job: ExtractionJob | undefined) {
  if (!job) return;

  // Opened inside the try so a tenant DB that won't open fails the job instead
  // of escaping into tick(). Declared out here so `finally` can still close it.
  let db: ReturnType<typeof getTenantDb> | undefined;

  try {
    db = getTenantDb(Number(job.user_id));

    const document = db
      .prepare(DOCUMENT_SQL.getDocumentById)
      .get(job.document_id) as DocumentRecord | undefined;

    // A document deleted mid-parse is not a failure — deleteDocument drops its
    // jobs, so this only loses a race with it. Failing here would burn all three
    // attempts and log an error for something the user asked for.
    if (!document) {
      completeJob(job.id);
      return;
    }

    db.prepare(DOCUMENT_SQL.updateStatus).run("processing", job.document_id);

    //parsingStep
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
    //Extraction Starts HERE
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

    completeJob(job.id);
  } catch (error) {
    const permanent =
      (error instanceof ParsingError &&
        (error.code === "unsupported" || error.code === "encrypted")) ||
      (error as { permanent?: boolean })?.permanent === true;
    const message = error instanceof Error ? error.message : String(error);

    const outcome = failJob(job.id, message, permanent);
    console.error(`[worker] job ${job.id} → ${outcome}: ${message}`);

    if (outcome === "failed") {
      db?.prepare(DOCUMENT_SQL.updateStatus).run("failed", job.document_id);
    }
  } finally {
    db?.close();
  }
}
