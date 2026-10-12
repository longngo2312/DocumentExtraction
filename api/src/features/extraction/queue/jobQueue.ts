import adminDB from "../../../db/adminDB.js";
import type { ExtractionJob } from "../../document/models/document.model.js";
import { QUEUE_SQLS } from "../sql/job.sql.js";

export function claimNextJob(): ExtractionJob | undefined {
  const db = adminDB.prepare(QUEUE_SQLS.claimJob).get() as
    | ExtractionJob
    | undefined;

  if (!db) {
    return undefined;
  }

  return db;
}

export function completeJob(jobId: number): void {
  adminDB.prepare(QUEUE_SQLS.complete).run(jobId);
}

export function failJob(
  jobId: number,
  message: string,
  permanent: boolean = false,
): "queued" | "failed" {
  // 0/1, not a boolean — SQLite binds numbers, strings, bigints, buffers, null.
  const flag = permanent ? 1 : 0;

  // The CASE in the SQL is what actually decides retry vs. permanent: attempts
  // can run out on an error that was retryable. Read the result back rather
  // than inferring it from `permanent`, or the caller marks a document
  // 'processing' forever on the attempt that finally gave up.
  const row = adminDB
    .prepare(QUEUE_SQLS.fail)
    // A pdf-parse stack trace in a grid cell is unreadable — cap it.
    .get(flag, message.slice(0, 500), flag, jobId) as
    | { status: "queued" | "failed" }
    | undefined;

  return row?.status ?? "failed";
}

export function recoverStaleJobs(): number {
  const result = adminDB.prepare(QUEUE_SQLS.resetStale).run();
  return result.changes;
}
