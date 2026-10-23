/**
 * query_values: a structured lookup over reviewed extracted values.
 *
 * "How many candidates hold a clearance?" is a count, and counting is what
 * vector search is worst at — five nearest passages cannot tell you there were
 * forty. This answers it exactly, from values a person has already checked.
 */

import type Database from "better-sqlite3";
import type { NormalizedBox } from "../../parsing/types.js";
import type { Source } from "../models/rag.model.js";
import { VALUES_SQL } from "../sql/values.sql.js";

export const VALUE_OPS = ["any", "eq", "contains", "gt", "gte", "lt", "lte"] as const;
export type ValueOp = (typeof VALUE_OPS)[number];

/** Rows handed to the model. The total is always exact; only the list is capped. */
const MAX_VALUE_ROWS = 20;

export interface ValueQuery {
  column: string;
  op: ValueOp;
  value: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
}

interface ValueRow {
  document_id: number;
  filename: string;
  column_name: string;
  value_text: string;
  llm_quote: string | null;
  source_page: number | null;
  source_start: number | null;
  source_end: number | null;
  source_boxes: string | null;
  total: number;
}

export function listColumns(db: Database.Database): ColumnInfo[] {
  return db.prepare(VALUES_SQL.listColumns).all() as ColumnInfo[];
}

const OP_WORDS: Record<ValueOp, string> = {
  any: "has any value",
  eq: "equals",
  contains: "contains",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
};

/** A LIKE pattern matches its own wildcards unless they are escaped. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Picks the fixed predicate fragment and its bound value. Comparisons need a
 * number or an ISO date; anything else cannot be compared honestly, so it
 * returns null and the caller reports that rather than guessing.
 */
function predicateFor(
  op: ValueOp,
  value: string,
): { sql: string; params: (string | number)[] } | null {
  if (op === "any") return { sql: VALUES_SQL.predicate.any, params: [] };
  if (op === "eq") return { sql: VALUES_SQL.predicate.eq, params: [value] };
  if (op === "contains") {
    return { sql: VALUES_SQL.predicate.contains, params: [likePattern(value)] };
  }

  const number = Number(value.replace(/[,$\s]/g, ""));
  if (value.trim() !== "" && Number.isFinite(number)) {
    return { sql: VALUES_SQL.predicate[`${op}_number`], params: [number] };
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return { sql: VALUES_SQL.predicate[`${op}_date`], params: [value.trim()] };
  }
  return null;
}

export function queryValues(
  db: Database.Database,
  query: ValueQuery,
  documentId?: number,
): { sources: Source[]; summary: string } {
  const label = `"${query.column}" ${OP_WORDS[query.op]}${query.op === "any" ? "" : ` "${query.value}"`}`;

  const predicate = predicateFor(query.op, query.value);
  if (!predicate) {
    return {
      sources: [],
      summary: `Could not compare ${label}: "${query.value}" is not a number or an ISO date.`,
    };
  }

  const sql = [
    VALUES_SQL.base,
    predicate.sql,
    documentId ? VALUES_SQL.scopeDocument : "",
    VALUES_SQL.tail,
  ].join("\n");
  const params = [
    query.column,
    ...predicate.params,
    ...(documentId ? [documentId] : []),
    MAX_VALUE_ROWS,
  ];

  const rows = db.prepare(sql).all(...params) as ValueRow[];
  const total = rows[0]?.total ?? 0;

  const sources: Source[] = rows.map((row) => {
    const boxes = row.source_boxes
      ? (JSON.parse(row.source_boxes) as NormalizedBox[])
      : null;
    return {
      kind: "value",
      documentId: row.document_id,
      filename: row.filename,
      page: row.source_page ?? 1,
      text: `${row.column_name}: ${row.value_text}`,
      quote: row.llm_quote ?? row.value_text,
      charStart: row.source_start,
      charEnd: row.source_end,
      boxes: boxes && boxes.length > 0 ? boxes : null,
      column: row.column_name,
    };
  });

  const shown = total > rows.length ? ` (first ${rows.length} listed)` : "";
  return {
    sources,
    summary: `Reviewed values where ${label}: ${total} document${total === 1 ? "" : "s"} match${shown}.`,
  };
}
