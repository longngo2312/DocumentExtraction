import type { ColumnDataType, SchemaColumn } from "../../types";

export const DATA_TYPES: ColumnDataType[] = ["text", "number", "date", "boolean", "enum"];

export interface ColumnDraft {
  name: string;
  description: string;
  data_type: ColumnDataType;
  enum_options: string;
  required: boolean;
}

/**
 * A draft plus a stable identity, so React keys survive insert and delete.
 * `id` is the saved column's id — absent until the column has been saved. The
 * server updates a column with an id in place, which is what keeps that
 * column's extracted values.
 */
export interface DraftRow extends ColumnDraft {
  uid: string;
  id?: number;
}

export function newRow(): DraftRow {
  return {
    uid: crypto.randomUUID(),
    name: "",
    description: "",
    data_type: "text",
    enum_options: "",
    required: false,
  };
}

export function toDraftRow(col: SchemaColumn): DraftRow {
  let enumStr = "";
  if (col.enum_options) {
    if (Array.isArray(col.enum_options)) {
      enumStr = col.enum_options.join(", ");
    } else {
      // `SELECT *` hands enum_options back as the raw JSON string.
      try {
        enumStr = (
          JSON.parse(col.enum_options as unknown as string) as string[]
        ).join(", ");
      } catch {
        enumStr = "";
      }
    }
  }
  return {
    uid: crypto.randomUUID(),
    id: col.id,
    name: col.name,
    description: col.description ?? "",
    data_type: col.data_type,
    enum_options: enumStr,
    required: Boolean(col.required),
  };
}

function splitOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The wire shape: drops the client-only uid and splits the comma-separated enum
 * field into the array the API stores as JSON.
 */
export function toPayload(rows: DraftRow[]) {
  return rows.map((col) => ({
    ...(col.id !== undefined && { id: col.id }),
    name: col.name.trim(),
    description: col.description,
    data_type: col.data_type,
    required: col.required,
    enum_options: col.data_type === "enum" ? splitOptions(col.enum_options) : null,
  }));
}

/** What the server would store — two equal snapshots mean nothing to save. */
export function snapshot(name: string, description: string, rows: DraftRow[]) {
  return JSON.stringify({ name: name.trim(), description, columns: toPayload(rows) });
}

export interface RowErrors {
  name?: string;
  options?: string;
}

export interface DraftErrors {
  name?: string;
  rows: Record<string, RowErrors>;
  /** Problems in total, for the summary announced on a failed save. */
  count: number;
}

/** The same rules the API enforces, worded for the field they sit under. */
export function validateDraft(name: string, rows: DraftRow[]): DraftErrors {
  const errors: DraftErrors = { rows: {}, count: 0 };
  if (!name.trim()) {
    errors.name = "Schema name is required.";
    errors.count++;
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const rowErrors: RowErrors = {};
    const key = row.name.trim().toLowerCase();
    if (!key) {
      rowErrors.name = "Name this field, or remove it.";
    } else if (seen.has(key)) {
      rowErrors.name = "Another field already uses this name.";
    }
    seen.add(key);
    if (row.data_type === "enum" && splitOptions(row.enum_options).length === 0) {
      rowErrors.options = "List at least one option, separated by commas.";
    }
    const n = Object.keys(rowErrors).length;
    if (n) {
      errors.rows[row.uid] = rowErrors;
      errors.count += n;
    }
  }
  return errors;
}
