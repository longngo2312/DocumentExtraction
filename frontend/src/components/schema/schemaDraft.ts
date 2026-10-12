import type { ColumnDataType, SchemaColumn } from "../../types";

export interface ColumnDraft {
  name: string;
  description: string;
  data_type: ColumnDataType;
  enum_options: string;
  required: boolean;
}

/** A draft plus a stable identity, so React keys survive insert and delete. */
export interface DraftRow extends ColumnDraft {
  uid: string;
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
    name: col.name,
    description: col.description ?? "",
    data_type: col.data_type,
    enum_options: enumStr,
    required: Boolean(col.required),
  };
}

/**
 * The wire shape: drops the client-only uid and splits the comma-separated enum
 * field into the array the API stores as JSON.
 */
export function toPayload(rows: DraftRow[]) {
  return rows.map((col) => ({
    name: col.name,
    description: col.description,
    data_type: col.data_type,
    required: col.required,
    enum_options:
      col.data_type === "enum"
        ? col.enum_options
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
  }));
}
