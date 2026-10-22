import type { ActiveQuote, NormalizedBox } from "../types";
import { apiFetch } from "./client";

/**
 * A grounded span in a specific document — either a retrieved passage or a
 * reviewed extracted value. Shaped to line up with `ActiveQuote` so a citation
 * drives the existing viewer highlight path with no new highlight code.
 */
export interface QueryCitation {
  kind: "passage" | "value";
  document_id: number;
  filename: string;
  page: number;
  quote: string;
  /** Page-local offsets. Null means the viewer searches for `quote` instead. */
  char_start: number | null;
  char_end: number | null;
  /** Null for formats with no geometry — office files, plain text. */
  boxes: NormalizedBox[] | null;
  /** Value citations only. */
  column?: string;
}

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: QueryCitation[];
  /**
   * The server found sources but the answer cites none of them. Shown as a
   * warning rather than presented as a grounded answer.
   */
  ungrounded?: boolean;
}

export interface QueryStatus {
  /** Whether the vector store is reachable at all. */
  qdrant: boolean;
  /** Documents that can be searched right now. */
  searchable: number;
  /** Documents being parsed or indexed — searchable shortly. */
  indexing: number;
  /** Parsed documents that are not searchable and have nothing queued. */
  unindexed: number;
}

/** The stored answer, and the chat it was saved into. */
export interface QueryAnswer extends QueryMessage {
  role: "assistant";
  session_id: number;
}

export interface ChatSessionSummary {
  id: number;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface ChatSession {
  id: number;
  title: string;
  messages: QueryMessage[];
}

/**
 * Ask a question across the user's searchable documents. Without a session id
 * the server starts a new chat and returns its id. No history is sent: the
 * server reads the conversation from its own record of it.
 */
export function askQuery(
  question: string,
  sessionId: number | null,
): Promise<QueryAnswer> {
  return apiFetch<QueryAnswer>("/query", {
    method: "POST",
    body: JSON.stringify({ question, session_id: sessionId }),
  });
}

export function listChatSessions(): Promise<ChatSessionSummary[]> {
  return apiFetch<ChatSessionSummary[]>("/query/sessions");
}

export function getChatSession(id: number): Promise<ChatSession> {
  return apiFetch<ChatSession>(`/query/sessions/${id}`);
}

export function deleteChatSession(id: number): Promise<void> {
  return apiFetch<void>(`/query/sessions/${id}`, { method: "DELETE" });
}

export function getQueryStatus(): Promise<QueryStatus> {
  return apiFetch<QueryStatus>("/query/status");
}

/** Queue every parsed-but-unsearchable document for indexing. */
export function indexMissingDocuments(): Promise<{ enqueued: number }> {
  return apiFetch<{ enqueued: number }>("/query/index", { method: "POST" });
}

/** The router state a citation hands the document page to highlight itself. */
export function citationToQuote(citation: QueryCitation): ActiveQuote {
  return {
    // No column owns a chat citation; -1 marks "not a field".
    columnId: -1,
    quote: citation.quote,
    pageNumber: citation.page,
    start: citation.char_start,
    end: citation.char_end,
    boxes: citation.boxes,
  };
}
