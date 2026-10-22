/**
 * One question, start to finish: route → tool(s) → answer → verify.
 *
 * At most two model calls, in a fixed order. Not a ReAct loop: a free-running
 * loop on a 7B at 8192 context fills its own window, and its usual failure is
 * looping until it does. The price is that it cannot decompose a question like
 * "compare the termination clauses across these three contracts".
 */

import type Database from "better-sqlite3";
import { OllamaProvider, chat } from "../../extraction/llms/ollama.js";
import type {
  AnswerResult,
  HistoryTurn,
  QueryCitation,
  Source,
} from "../models/rag.model.js";
import { searchPassages } from "./retrieval.service.js";
import {
  VALUE_OPS,
  listColumns,
  queryValues,
  type ColumnInfo,
  type ValueOp,
  type ValueQuery,
} from "./values.service.js";

export const REFUSAL = "The documents I have access to do not cover this.";

type Tool = "search_passages" | "query_values" | "both";

interface Route {
  tool: Tool;
  searchQuery: string;
  values: ValueQuery | null;
}

// ─── Route ───────────────────────────────────────────────────────────────────

const ROUTE_SYSTEM = `You decide how to look up the answer to a question about the user's documents. You do not answer it.

Tools:
- search_passages: finds passages of text. Use for what a document says, explains or describes, and for anything that is not about one specific field.
- query_values: looks up a structured field that was extracted from every document and checked by a reviewer. Use for counting, listing, filtering or comparing a field across documents — "how many", "which documents", "list every", "more than", "before <date>".
- both: when the question needs a field lookup and an explanation from the text.

For query_values, set column to one of the listed fields, op to one of: any (has a value), eq, contains, gt, gte, lt, lte — and value to what it is compared with. Comparisons need a plain number or an ISO date (YYYY-MM-DD).

Always set search_query: the question rewritten to stand on its own, resolving words like "it" or "that one" from the conversation.`;

function routeSchema(columns: ColumnInfo[]) {
  const tools: Tool[] = columns.length
    ? ["search_passages", "query_values", "both"]
    : ["search_passages"];
  return {
    type: "object",
    properties: {
      tool: { type: "string", enum: tools },
      search_query: { type: "string" },
      ...(columns.length
        ? {
            column: { type: "string", enum: columns.map((c) => c.name) },
            op: { type: "string", enum: VALUE_OPS },
            value: { type: "string" },
          }
        : {}),
    },
    required: ["tool", "search_query"],
  };
}

function transcript(history: HistoryTurn[]): string {
  return history
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n");
}

/**
 * Constrained decoding is not a security boundary, so every field is checked
 * again here. Anything off the fixed surface degrades to a plain passage
 * search rather than reaching a query.
 */
export function validateRoute(
  raw: unknown,
  question: string,
  columns: ColumnInfo[],
): Route {
  const out = (raw ?? {}) as Record<string, unknown>;
  const searchQuery =
    typeof out.search_query === "string" &&
    out.search_query.trim() &&
    out.search_query.length <= 500
      ? out.search_query.trim()
      : question;

  let tool: Tool = ["search_passages", "query_values", "both"].includes(
    out.tool as string,
  )
    ? (out.tool as Tool)
    : "search_passages";

  let values: ValueQuery | null = null;
  if (tool !== "search_passages") {
    const column = columns.find(
      (c) => c.name.toLowerCase() === String(out.column ?? "").toLowerCase(),
    );
    const op = VALUE_OPS.includes(out.op as ValueOp) ? (out.op as ValueOp) : null;
    const value = typeof out.value === "string" ? out.value.slice(0, 200) : "";

    if (column && op && (op === "any" || value.trim())) {
      values = { column: column.name, op, value };
    } else {
      tool = "search_passages";
    }
  }

  return { tool, searchQuery, values };
}

async function routeQuestion(
  question: string,
  history: HistoryTurn[],
  columns: ColumnInfo[],
): Promise<Route> {
  // Nothing to choose and nothing to resolve: skip the call entirely.
  if (columns.length === 0 && history.length === 0) {
    return { tool: "search_passages", searchQuery: question, values: null };
  }

  const fields = columns.length
    ? `Fields available for query_values:\n${columns.map((c) => `- ${c.name} (${c.data_type})`).join("\n")}`
    : "No structured fields exist yet — use search_passages.";
  const conversation = history.length
    ? `Conversation so far:\n${transcript(history)}\n\n`
    : "";

  try {
    const raw = await OllamaProvider.complete({
      system: ROUTE_SYSTEM,
      prompt: `${fields}\n\n${conversation}Question: ${question}`,
      schema: routeSchema(columns),
      options: { num_predict: 200 },
    });
    return validateRoute(raw, question, columns);
  } catch (error) {
    // A bad route is not worth failing the question over. If Ollama is down
    // the answer call fails too, and reports it properly.
    console.warn("[rag] route call failed, falling back to search:", error);
    return { tool: "search_passages", searchQuery: question, values: null };
  }
}

// ─── Answer ──────────────────────────────────────────────────────────────────

const ANSWER_SYSTEM = `You answer questions about the user's documents using only the numbered sources you are given.

Rules:
- End every factual sentence with the number of the source it came from, like [2]. Cite only sources you actually used.
- Use no outside knowledge. Do not guess, and do not fill gaps.
- If the sources do not answer the question, reply with exactly: "${REFUSAL}"
- A structured lookup states an exact count. Report it as given.
- Be concise: the answer first, then supporting detail.`;

function describeSource(source: Source, n: number): string {
  const where =
    source.kind === "value"
      ? `${source.filename} — reviewed value`
      : `${source.filename}, page ${source.page}`;
  return `[${n}] ${where}\n${source.text}`;
}

/** Old [n] markers point at sources this turn never sees — strip them. */
function stripMarkers(text: string): string {
  return text.replace(/\s*\[\d+(?:\s*[-–,]\s*\d+)*\]/g, "");
}

// ─── Verify ──────────────────────────────────────────────────────────────────

const MARKER = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g;

/**
 * Keeps only markers that point at a retrieved source, and renumbers the
 * survivors 1..M in order of first use so the chips in the prose and the
 * sources list line up. A model can write "[9]" with five sources; that must
 * never reach the client looking like a citation.
 *
 * Returns the cleaned text and the 0-based indices of the sources it cites.
 */
export function verifyCitations(
  text: string,
  sourceCount: number,
): { text: string; used: number[] } {
  const used: number[] = [];
  const renumbered = new Map<number, number>();

  const rewritten = text.replace(MARKER, (_match, group: string) => {
    const numbers = group.split(",").flatMap((part) => {
      const [from, to] = part.split(/[-–]/).map((s) => Number(s.trim()));
      if (to === undefined) return [from];
      // A range like [2-4]; capped so "[1-99999]" cannot build a huge array.
      return to >= from && to - from < 20
        ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
        : [];
    });

    const valid = [
      ...new Set(
        numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= sourceCount),
      ),
    ];
    return valid
      .map((n) => {
        if (!renumbered.has(n)) {
          used.push(n - 1);
          renumbered.set(n, used.length);
        }
        return `[${renumbered.get(n)}]`;
      })
      .join("");
  });

  // Dropping a marker can strand the space before it: "it was signed [9]."
  return {
    text: rewritten
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
    used,
  };
}

function toCitation(source: Source): QueryCitation {
  return {
    kind: source.kind,
    document_id: source.documentId,
    filename: source.filename,
    page: source.page,
    quote: source.quote,
    char_start: source.charStart,
    char_end: source.charEnd,
    boxes: source.boxes,
    ...(source.column ? { column: source.column } : {}),
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function answerQuestion(
  db: Database.Database,
  userId: number,
  question: string,
  history: HistoryTurn[],
  documentId?: number,
): Promise<AnswerResult> {
  const columns = listColumns(db);
  const route = await routeQuestion(question, history, columns);

  const sources: Source[] = [];
  let lookupSummary: string | null = null;

  if (route.tool !== "query_values") {
    sources.push(
      ...(await searchPassages(db, userId, route.searchQuery, documentId)),
    );
  }
  if (route.values) {
    const result = queryValues(db, route.values, documentId);
    sources.push(...result.sources);
    lookupSummary = result.summary;
  }

  // The router reads "how much notice is required" as a field lookup when a
  // notice_period column exists. Zero *reviewed* matches does not mean the
  // documents are silent — it often means nobody has reviewed them yet — so
  // search the text before reporting a count of nothing. The zero count is
  // dropped if passages answer: "0 documents match" beside a passage stating
  // the answer would contradict it.
  if (route.tool === "query_values" && sources.length === 0) {
    const passages = await searchPassages(db, userId, route.searchQuery, documentId);
    if (passages.length > 0) {
      sources.push(...passages);
      lookupSummary = null;
    }
  }

  const reply = (
    content: string,
    citations: QueryCitation[] = [],
    ungrounded = false,
  ): AnswerResult => ({ content, citations, ungrounded });

  // Nothing relevant found: say so without asking the model. It cannot invent
  // an answer it was never asked for, and the user gets the refusal in
  // milliseconds instead of after a generation.
  if (sources.length === 0) {
    return reply(
      lookupSummary
        ? `${lookupSummary} Only values accepted or corrected in review are counted.`
        : REFUSAL,
    );
  }

  const prompt = [
    "Sources:",
    sources.map((source, i) => describeSource(source, i + 1)).join("\n\n"),
    lookupSummary ? `\nStructured lookup: ${lookupSummary}` : "",
    `\nQuestion: ${question}`,
  ].join("\n");

  const raw = await chat([
    { role: "system", content: ANSWER_SYSTEM },
    // History carries the conversation, never the old sources — those belong
    // to a turn this one cannot see, and would crowd the 8192 window.
    ...history.map((turn) => ({ role: turn.role, content: stripMarkers(turn.content) })),
    { role: "user", content: prompt },
  ]);

  const verified = verifyCitations(raw, sources.length);
  const refused = verified.text.includes(REFUSAL.replace(/\.$/, ""));

  return reply(
    verified.text,
    refused ? [] : verified.used.map((i) => toCitation(sources[i])),
    !refused && verified.used.length === 0,
  );
}
