/**
 * Stored conversations. Each tenant's chats live in that tenant's own DB, so
 * session ids need no ownership check: another user's session is not in this
 * database to be found.
 */

import type Database from "better-sqlite3";
import type {
  AnswerResult,
  ChatMessage,
  HistoryTurn,
  QueryCitation,
} from "../models/rag.model.js";
import { CHAT_SQL } from "../sql/chat.sql.js";

/** Two turns. More exhausts the 8192 window mid-conversation. */
const HISTORY_MESSAGES = 4;
const SESSION_LIST_LIMIT = 50;
const TITLE_CHARS = 60;

export interface ChatSessionSummary {
  id: number;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface ChatSessionDetail {
  id: number;
  title: string;
  messages: ChatMessage[];
}

interface MessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations_json: string;
  ungrounded: number;
}

/** The first question, on one line, short enough for a list row. */
export function titleFrom(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  return line.length > TITLE_CHARS ? `${line.slice(0, TITLE_CHARS - 1)}…` : line;
}

export function sessionExists(db: Database.Database, sessionId: number): boolean {
  return Boolean(db.prepare(CHAT_SQL.getSession).get(sessionId));
}

/** What the next answer may see of this conversation, oldest first. */
export function recentHistory(
  db: Database.Database,
  sessionId: number,
): HistoryTurn[] {
  const rows = db
    .prepare(CHAT_SQL.recentMessages)
    .all(sessionId, HISTORY_MESSAGES) as HistoryTurn[];
  return rows.reverse();
}

/**
 * Store a question and its answer — and, for a new chat, the session itself —
 * in one transaction, and only once the answer exists. A question that failed
 * to answer leaves nothing behind: no orphan user turn in an old chat, and no
 * empty chat in the list for a first question that never got a reply.
 */
export const saveTurn = (
  db: Database.Database,
  sessionId: number | null,
  question: string,
  answer: AnswerResult,
): { sessionId: number; messageId: number } =>
  db.transaction(() => {
    const id =
      sessionId ??
      Number(db.prepare(CHAT_SQL.insertSession).run(titleFrom(question)).lastInsertRowid);

    const insert = db.prepare(CHAT_SQL.insertMessage);
    insert.run(id, "user", question, "[]", 0);
    const { lastInsertRowid } = insert.run(
      id,
      "assistant",
      answer.content,
      JSON.stringify(answer.citations),
      answer.ungrounded ? 1 : 0,
    );
    db.prepare(CHAT_SQL.touchSession).run(id);

    return { sessionId: id, messageId: Number(lastInsertRowid) };
  })();

export function listSessions(db: Database.Database): ChatSessionSummary[] {
  return db.prepare(CHAT_SQL.listSessions).all(SESSION_LIST_LIMIT) as ChatSessionSummary[];
}

export function getSession(
  db: Database.Database,
  sessionId: number,
): ChatSessionDetail | null {
  const session = db.prepare(CHAT_SQL.getSession).get(sessionId) as
    | { id: number; title: string }
    | undefined;
  if (!session) return null;

  const rows = db.prepare(CHAT_SQL.getMessages).all(sessionId) as MessageRow[];
  return {
    id: session.id,
    title: session.title,
    messages: rows.map((row) => ({
      id: String(row.id),
      role: row.role,
      content: row.content,
      citations: JSON.parse(row.citations_json) as QueryCitation[],
      ungrounded: Boolean(row.ungrounded),
    })),
  };
}

/** False when there was no such session, so the caller can 404. */
export function deleteSession(db: Database.Database, sessionId: number): boolean {
  return db.prepare(CHAT_SQL.deleteSession).run(sessionId).changes > 0;
}
