import type { Request, Response } from "express";
import adminDB from "../../../db/adminDB.js";
import { getTenantDb } from "../../../db/tenantDb.js";
import { JOB_SQL } from "../../document/sqls/document.sql.js";
import { enqueueJob, hasPendingJob } from "../../extraction/queue/jobQueue.js";
import { notifyWorker } from "../../extraction/worker.js";
import type { QueryAnswer } from "../models/rag.model.js";
import { answerQuestion } from "../services/answer.service.js";
import {
  deleteSession,
  getSession,
  listSessions,
  recentHistory,
  saveTurn,
  sessionExists,
} from "../services/chat.service.js";
import { CHUNKS_SQL } from "../sql/chunks.sql.js";
import { QdrantUnavailableError, isQdrantUp } from "../vector/qdrant.js";

const MAX_QUESTION_CHARS = 2000;

/**
 * Optional positive integer from a body field or route param. Returns null
 * when absent, and NaN when present but malformed — so a caller can tell
 * "not given" from "given wrong" and answer the second with a 400.
 */
function readId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

/** Parsed documents with no embedded chunks and nothing queued to fix that. */
function documentsNeedingIndex(
  db: ReturnType<typeof getTenantDb>,
  userId: number,
): number[] {
  const rows = db.prepare(CHUNKS_SQL.unindexedDocuments).all() as {
    document_id: number;
  }[];
  return rows
    .map((row) => row.document_id)
    .filter(
      (id) =>
        !hasPendingJob(userId, id, "index") && !hasPendingJob(userId, id, "parse"),
    );
}

// POST /api/query
export async function postQuery(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) return res.status(400).json({ error: "A question is required" });
  if (question.length > MAX_QUESTION_CHARS) {
    return res
      .status(400)
      .json({ error: `Questions are limited to ${MAX_QUESTION_CHARS} characters` });
  }

  const documentId = readId(req.body?.document_id);
  if (Number.isNaN(documentId)) {
    return res.status(400).json({ error: "document_id must be a positive integer" });
  }
  // Absent means "start a new chat"; the session is created with the answer.
  const sessionId = readId(req.body?.session_id);
  if (Number.isNaN(sessionId)) {
    return res.status(400).json({ error: "session_id must be a positive integer" });
  }

  const db = getTenantDb(userId);
  try {
    if (sessionId && !sessionExists(db, sessionId)) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const answer = await answerQuestion(
      db,
      userId,
      question,
      // The stored conversation — never history the client sends.
      sessionId ? recentHistory(db, sessionId) : [],
      documentId ?? undefined,
    );
    const saved = saveTurn(db, sessionId, question, answer);

    const response: QueryAnswer = {
      id: String(saved.messageId),
      role: "assistant",
      session_id: saved.sessionId,
      ...answer,
    };
    res.json(response);
  } catch (error) {
    if (error instanceof QdrantUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    // Ollama failures already carry a message naming the service and the fix.
    console.error("[rag] query failed:", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "The query could not be answered",
    });
  } finally {
    db.close();
  }
}

// GET /api/query/status — drives the three real empty states on the query page.
export async function getQueryStatus(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  const db = getTenantDb(userId);
  try {
    const searchable = (
      db.prepare(CHUNKS_SQL.countSearchableDocuments).get() as { n: number }
    ).n;
    const indexing = (
      adminDB.prepare(JOB_SQL.countPendingSearchJobs).get(userId) as { n: number }
    ).n;

    res.json({
      qdrant: await isQdrantUp(),
      searchable,
      indexing,
      unindexed: documentsNeedingIndex(db, userId).length,
    });
  } finally {
    db.close();
  }
}

// POST /api/query/index — backfill. Documents parsed before search existed, or
// whose index job ran out of retries, are not searchable until this runs.
export function indexMissing(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  const db = getTenantDb(userId);
  try {
    const ids = documentsNeedingIndex(db, userId);
    for (const id of ids) enqueueJob(userId, id, "index");
    if (ids.length > 0) notifyWorker();
    res.json({ enqueued: ids.length });
  } finally {
    db.close();
  }
}

// GET /api/query/sessions — newest first, for the history lists.
export function listChatSessions(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  const db = getTenantDb(userId);
  try {
    res.json(listSessions(db));
  } finally {
    db.close();
  }
}

// GET /api/query/sessions/:id — one chat with every message, to reopen it.
export function getChatSession(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  const sessionId = readId(req.params.id);
  if (!sessionId) return res.status(400).json({ error: "Invalid chat id" });

  const db = getTenantDb(userId);
  try {
    const session = getSession(db, sessionId);
    if (!session) return res.status(404).json({ error: "Chat not found" });
    res.json(session);
  } finally {
    db.close();
  }
}

// DELETE /api/query/sessions/:id — messages go with it (ON DELETE CASCADE).
export function deleteChatSession(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "User authentication required" });

  const sessionId = readId(req.params.id);
  if (!sessionId) return res.status(400).json({ error: "Invalid chat id" });

  const db = getTenantDb(userId);
  try {
    if (!deleteSession(db, sessionId)) {
      return res.status(404).json({ error: "Chat not found" });
    }
    res.status(204).end();
  } finally {
    db.close();
  }
}
