import { normalizeWhiteSpace } from "../../parsing/utils/text.util.js";
import type { SchemaColumns } from "../../schema/models/schema.model.js";
export interface CoercedValue {
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
}

const booleanValue = {
  true: new Set(["true", "yes", "y", "1"]),
  false: new Set(["false", "no", "n", "0"]),
};
const MONTHS: Record<string, string> = {
  january: "01",
  jan: "01",

  february: "02",
  feb: "02",

  march: "03",
  mar: "03",

  april: "04",
  apr: "04",

  may: "05",

  june: "06",
  jun: "06",

  july: "07",
  jul: "07",

  august: "08",
  aug: "08",

  september: "09",
  sep: "09",

  october: "10",
  oct: "10",

  november: "11",
  nov: "11",

  december: "12",
  dec: "12",
};

function isValidDate(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  // Basic numeric validation
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }

  const date = new Date(Date.UTC(y, m - 1, d));

  // Date normalizes invalid dates, e.g. Feb 30 → March 2.
  // Compare the components to make sure normalization did not occur.
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function parseDate(raw: string): string | null {
  const value = raw.trim();

  if (value === "") {
    return null;
  }

  /*
   * YYYY-MM-DD
   *
   * Example:
   * 2026-03-04 → 2026-03-04
   */
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match) {
    const [, year, month, day] = match;

    if (!isValidDate(year, month, day)) {
      return null;
    }

    return `${year}-${month}-${day}`;
  }

  /*
   * MM/DD/YYYY or M/D/YYYY
   *
   * We intentionally assume US month/day/year ordering.
   *
   * Example:
   * 03/04/2026 → 2026-03-04
   * 3/4/2026   → 2026-03-04
   */
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);

  if (match) {
    const [, month, day, year] = match;

    const normalizedMonth = month.padStart(2, "0");
    const normalizedDay = day.padStart(2, "0");

    if (!isValidDate(year, normalizedMonth, normalizedDay)) {
      return null;
    }

    return `${year}-${normalizedMonth}-${normalizedDay}`;
  }

  /*
   * Month D, YYYY
   * Month D YYYY
   *
   * Examples:
   * March 4, 2026
   * March 4 2026
   * Mar 4, 2026
   */
  match = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);

  if (match) {
    const [, monthName, day, year] = match;

    const month = MONTHS[monthName.toLowerCase()];

    if (!month) {
      return null;
    }

    const normalizedDay = day.padStart(2, "0");

    if (!isValidDate(year, month, normalizedDay)) {
      return null;
    }

    return `${year}-${month}-${normalizedDay}`;
  }

  /*
   * D Month YYYY
   *
   * Examples:
   * 4 March 2026
   * 4 Mar 2026
   */
  match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value);

  if (match) {
    const [, day, monthName, year] = match;

    const month = MONTHS[monthName.toLowerCase()];

    if (!month) {
      return null;
    }

    const normalizedDay = day.padStart(2, "0");

    if (!isValidDate(year, month, normalizedDay)) {
      return null;
    }

    return `${year}-${month}-${normalizedDay}`;
  }

  // Unsupported format
  return null;
}

export function coerce(
  raw: string | null,
  dataType: SchemaColumns["data_type"],
  enumOptions: string[] | null,
): CoercedValue {
  const empty: CoercedValue = {
    value_text: null,
    value_date: null,
    value_number: null,
  };

  if (raw === null) {
    return empty;
  }

  // Each case gets its own block. Without braces every branch shares one scope,
  // which is how `enum` ended up reading `number`'s `value` binding.
  switch (dataType) {
    case "text": {
      const data = normalizeWhiteSpace(raw).trim();
      if (data === "") return empty;
      return {
        ...empty,
        value_text: data,
      };
    }
    case "number": {
      const value = raw.trim();
      if (value === "") return empty;

      // qwen2.5 decorates numbers when the grammar forces them into a string —
      // observed output includes "{1100.00}" and "strconv($1,234.56)". Peel that
      // off before looking at the number itself.
      const unwrapped = value
        .replace(/[{}]/g, "")
        .replace(/^[A-Za-z_][A-Za-z0-9_]*\s*\((.*)\)$/, "$1")
        .trim();

      // Accounting notation: (1,234.56) means -1234.56.
      const negated = /^\((.*)\)$/.exec(unwrapped);
      const body = negated ? negated[1] : unwrapped;

      // Documents write money, not JavaScript numbers — drop currency symbols,
      // thousands separators and inner spaces.
      const digits = body.replace(/[$€£¥,\s]/g, "");
      if (digits === "") return empty;

      const number = Number(digits);

      if (Number.isNaN(number)) return empty;

      return {
        ...empty,
        value_number: negated ? -number : number,
        // The UI reads value_text. Keep the document's own formatting — a
        // reviewer who sees 1234.56 where the page said $1,234.56 assumes we
        // mangled it — but without the model's decoration. llm_value still has
        // the untouched original.
        value_text: unwrapped,
      };
    }
    case "date": {
      const date = parseDate(raw);
      return {
        ...empty,
        value_date: date,
      };
    }
    case "boolean": {
      const flag = normalizeWhiteSpace(raw).trim().toLowerCase();
      if (booleanValue["true"].has(flag))
        return { ...empty, value_text: "true" };
      if (booleanValue["false"].has(flag))
        return { ...empty, value_text: "false" };
      return empty;
    }
    case "enum": {
      if (!enumOptions) {
        return empty;
      }

      const enumVal = normalizeWhiteSpace(raw).trim();
      const canonical = enumOptions.find(
        (option) => option.toLowerCase() === enumVal.toLowerCase(),
      );
      return {
        ...empty,
        value_text: canonical ?? null,
      };
    }
    default:
      return empty;
  }
}
