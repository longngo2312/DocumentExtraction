const UNITS = ["B", "KB", "MB", "GB"];

/** 1536 -> "1.5 KB". Sizes come off the API as raw bytes. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Whole bytes read oddly as "512.0 B", so only show a decimal above KB.
  const decimals = unit === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/**
 * "2026-08-10 19:10:03" (SQLite, UTC) -> a local-time display string.
 * The trailing Z is what stops the browser reading the timestamp as local.
 */
export function formatDayTime(value: string): string {
  const iso = value.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleString();
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.345],
  ["month", 12],
];

/**
 * "2026-08-10 19:10:03" (SQLite, UTC) -> "2 minutes ago". Card footers want
 * the age, not the timestamp. Intl does the pluralising and the "ago"; the
 * only thing here is picking which unit to hand it.
 */
export function formatRelative(value: string): string {
  const then = new Date(value.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return "";

  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let amount = (Date.now() - then) / 1000;

  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(amount) < size) return format.format(-Math.round(amount), unit);
    amount /= size;
  }
  return format.format(-Math.round(amount), "year");
}
