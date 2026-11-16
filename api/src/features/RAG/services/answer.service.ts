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
import { OVERVIEW_SQL } from "../sql/overview.sql.js";
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

type Tool =
  | "search_passages"
  | "query_values"
  | "both"
  | "document_overview"
  | "about_app"
  | "general_knowledge";

/** The three tools that read the user's documents. */
const DOCUMENT_TOOLS: Tool[] = ["search_passages", "query_values", "both"];

interface Route {
  tool: Tool;
  searchQuery: string;
  values: ValueQuery | null;
}

// ─── Route ───────────────────────────────────────────────────────────────────

const ROUTE_SYSTEM = `You decide how to look up the answer to a question about the user's documents. You do not answer it.

Tools:
- search_passages: finds passages of text. Use for what a document says, explains or describes, and for anything that is not about one specific field.
- query_values: looks up a structured field that was extracted from every document and checked by a reviewer. Use for counting, listing, filtering or comparing a field across documents — "how many", "which documents", "list every", "more than", "before <date>". If the question names one of the fields listed below and compares it against a value, this is the tool, whatever word the question starts with: "which agreements have a monthly fee over 10000" and "how many are governed by Texas law" are both query_values.
- both: when the question needs a field lookup and an explanation from the text.
- document_overview: describes what a whole document contains. Use for "summarize this document", "what is this file about", "what are the key findings", "what did you find in the one I just uploaded".
- about_app: the question is about you — what you can do, how you work, what file types you accept — or it is a greeting with no question in it.
- general_knowledge: the question is not about the user's documents or about you at all. Everyday conversation, or a fact about the world.

For query_values, set column to one of the listed fields, op to one of: any (has a value), eq, contains, gt, gte, lt, lte — and value to what it is compared with. Comparisons need a plain number or an ISO date (YYYY-MM-DD).

Always set search_query: the question rewritten to stand on its own, resolving words like "it" or "that one" from the conversation.`;

function routeSchema(columns: ColumnInfo[]) {
  // The field-lookup tools are only offered when there are fields to look up.
  const tools: Tool[] = [
    "search_passages",
    ...(columns.length ? (["query_values", "both"] as Tool[]) : []),
    "document_overview",
    "about_app",
    "general_knowledge",
  ];
  return {
    type: "object",
    properties: {
      tool: { type: "string", enum: tools },
      search_query: { type: "string" },
      ...(columns.length
        ? {
            column: { type: "string", enum: columns.map((c) => c.name) },
            op: { type: "string", enum: VALUE_OPS },
            // A number, not only a string: asked for a fee over 10000 the
            // model returned an empty value rather than put a number in a
            // string, and the whole lookup was then discarded below.
            value: { type: ["string", "number"] },
          }
        : {}),
    },
    required: ["tool", "search_query"],
  };
}

function transcript(history: HistoryTurn[]): string {
  return history
    .map(
      (turn) =>
        `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`,
    )
    .join("\n");
}

export function comparisonValue(question: string): string {
  const iso = question.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  // Prefer a figure introduced by a comparison word, so "fees over 10000 in
  // 2026" compares against 10000 rather than against the year.
  const led = question.match(
    /(?:over|above|under|below|more than|less than|greater than|at least|at most|exceeds?|before|after)\s+\$?([\d,]+(?:\.\d+)?)/i,
  );
  const last = [...question.matchAll(/\$?([\d,]+(?:\.\d+)?)/g)].pop();
  const picked = led?.[1] ?? last?.[1];
  return picked ? picked.replace(/,/g, "") : "";
}

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

  const ALL_TOOLS: string[] = [
    ...DOCUMENT_TOOLS,
    "document_overview",
    "about_app",
    "general_knowledge",
  ];
  let tool: Tool = ALL_TOOLS.includes(out.tool as string)
    ? (out.tool as Tool)
    : "search_passages";

  let values: ValueQuery | null = null;
  if (tool === "query_values" || tool === "both") {
    // Compared without spaces, underscores or case: the model answers a field
    // called monthly_fee as "monthly fee" about a third of the time, and an
    // exact compare threw that lookup away and left the question unanswered.
    const plain = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const column = columns.find(
      (c) => plain(c.name) === plain(String(out.column ?? "")),
    );
    const op = VALUE_OPS.includes(out.op as ValueOp)
      ? (out.op as ValueOp)
      : null;
    const value =
      typeof out.value === "number"
        ? String(out.value)
        : typeof out.value === "string"
          ? out.value.slice(0, 200)
          : "";

    // An empty value is filled from the question rather than wasting the
    // correct column and operator the model did choose.
    const figure =
      op && op !== "any" && !value.trim() ? comparisonValue(question) : value;

    if (column && op && (op === "any" || figure.trim())) {
      values = { column: column.name, op, value: figure };
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

// ─── Answers that do not come from a passage search ──────────────────────────

/**
 * What to say when asked what this app does.
 *
 * The facts are listed here so the model describes the real product instead of
 * guessing at features from its name.
 */
const ABOUT_APP_SYSTEM = `You are the assistant inside a document extraction app. Answer briefly and warmly, in the first person, using only the facts below. If you are asked something about the app that is not listed here, say you are not sure rather than guessing.

What the app does:
- The user defines a schema: a list of fields they want pulled out of every document, each with a description saying what to extract.
- They upload files: PDF, Word, Excel, PowerPoint, images, or plain text, up to 25MB. Scanned pages and photos go through OCR.
- A local AI model fills in the schema for each document. Every value comes with the exact sentence it was taken from, highlighted on the page.
- The user reviews each value and accepts, edits or rejects it.
- Then they can ask me questions across their documents, and I answer with citations they can click to jump to the source.
- I can also summarize any single document.
- Everything runs on the user's own machine. No document ever leaves it.

What I cannot do: add up or average numbers across documents, and answer about documents that have not finished processing.`;

/** Plain conversation, for questions that are not about the documents or the app. */
const GENERAL_SYSTEM = `You are a helpful assistant inside a document extraction app. Answer the question briefly and plainly.

For this answer you are not looking at any of the user's documents, so do not claim anything about what their documents contain. If the question turns out to need their documents, say so and invite them to ask again about a specific document.`;

async function talk(
  system: string,
  question: string,
  history: HistoryTurn[],
): Promise<string> {
  return chat([
    { role: "system", content: system },
    ...history.map((turn) => ({
      role: turn.role,
      content: stripMarkers(turn.content),
    })),
    { role: "user", content: question },
  ]);
}

interface SummaryRow {
  filename: string;
  overview: string;
  key_findings: string;
  caveats: string;
}

/**
 * Picks which document a summary question is about: the one the page is scoped
 * to, else one the question names, else the most recently uploaded.
 */
function pickDocument(
  db: Database.Database,
  question: string,
  documentId?: number,
): { id: number; others: number } | null {
  const rows = db.prepare(OVERVIEW_SQL.listWithSummary).all() as {
    id: number;
    filename: string;
  }[];
  if (rows.length === 0) return null;
  const others = rows.length - 1;

  if (documentId && rows.some((row) => row.id === documentId)) {
    return { id: documentId, others };
  }

  // "summarize the meridian agreement" should not return whatever was newest.
  const asked = question.toLowerCase();
  let best: { id: number; score: number } | null = null;
  for (const row of rows) {
    const words = row.filename
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4);
    const score = words.filter((word) => asked.includes(word)).length;
    if (score > 0 && (!best || score > best.score))
      best = { id: row.id, score };
  }

  return { id: best ? best.id : rows[0].id, others };
}

/**
 * Answers "summarize this document" from the summary already stored for it.
 *
 * Assembled here rather than sent through the model: the text is already
 * written, so repeating it costs a minute of generation and risks changing it.
 * Returns null when there is no summary, so the caller can fall back to search.
 */
function overviewAnswer(
  db: Database.Database,
  question: string,
  documentId?: number,
): AnswerResult | null {
  const picked = pickDocument(db, question, documentId);
  if (!picked) return null;

  const row = db.prepare(OVERVIEW_SQL.byDocument).get(picked.id) as
    | SummaryRow
    | undefined;
  if (!row) return null;

  const list = (raw: string): string[] => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x) => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  };

  const parts = [`**${row.filename}**`, "", row.overview];
  const findings = list(row.key_findings);
  if (findings.length) {
    parts.push(
      "",
      "Key findings:",
      ...findings.map((f) => `- ${f.replace(/^[-•]\s*/, "")}`),
    );
  }
  const caveats = list(row.caveats);
  if (caveats.length) {
    parts.push(
      "",
      "Worth checking by hand:",
      ...caveats.map((c) => `- ${c.replace(/^[-•]\s*/, "")}`),
    );
  }
  if (!documentId && picked.others > 0) {
    parts.push(
      "",
      `You have ${picked.others} other summarized document${picked.others === 1 ? "" : "s"} — name one to summarize it instead.`,
    );
  }

  return { content: parts.join("\n"), citations: [], ungrounded: false };
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
        numbers.filter(
          (n) => Number.isInteger(n) && n >= 1 && n <= sourceCount,
        ),
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

  // Questions that are not a search over the documents. Handled before
  // retrieval, because searching for passages that answer "hi, what can you
  // do" finds nothing and used to end in a refusal.
  if (route.tool === "about_app") {
    return {
      content: await talk(ABOUT_APP_SYSTEM, question, history),
      citations: [],
      ungrounded: false,
    };
  }
  if (route.tool === "general_knowledge") {
    return {
      content: await talk(GENERAL_SYSTEM, question, history),
      citations: [],
      // Nothing backs this up in the user's documents, and the chat marks it.
      ungrounded: true,
    };
  }
  if (route.tool === "document_overview") {
    const overview = overviewAnswer(db, question, documentId);
    // No summary to read: fall through and search the text instead.
    if (overview) return overview;
    route.tool = "search_passages";
  }

  const sources: Source[] = [];
  let lookupSummary: string | null = null;

  if (route.tool !== "query_values") {
    sources.push(
      ...(await searchPassages(db, userId, route.searchQuery, documentId)),
    );
  }
  let valueSources: Source[] = [];
  if (route.values) {
    const result = queryValues(db, route.values, documentId);
    valueSources = result.sources;
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
    const passages = await searchPassages(
      db,
      userId,
      route.searchQuery,
      documentId,
    );
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

  // A field lookup is answered from the lookup itself, with no generation step.
  // The count and the matching rows come from SQL, so they are already exact;
  // asking the model to put them into a sentence only invites it to get the
  // arithmetic wrong. Asked which agreements cost over $10,000 a month it
  // answered "$31,750.00 and $4,200.00. Both exceed $10,000 per month."
  if (lookupSummary && valueSources.length > 0) {
    const lines = valueSources.map(
      (source) => `- ${source.filename} — ${source.text}`,
    );
    return reply(
      [
        `${lookupSummary} Only values accepted or corrected in review are counted.`,
        "",
        ...lines,
      ].join("\n"),
      valueSources.map(toCitation),
    );
  }

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
    ...history.map((turn) => ({
      role: turn.role,
      content: stripMarkers(turn.content),
    })),
    { role: "user", content: prompt },
  ]);

  const verified = verifyCitations(raw, sources.length);
  const refused = verified.text.includes(REFUSAL.replace(/\.$/, ""));

  // came from the database, so it stands even when the model declined to use it.
  if (refused) {
    return reply(
      lookupSummary
        ? `${lookupSummary} Only values accepted or corrected in review are counted.`
        : REFUSAL,
    );
  }

  return reply(
    verified.text,
    verified.used.map((i) => toCitation(sources[i])),
    verified.used.length === 0,
  );
}
