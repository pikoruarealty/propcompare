/**
 * A small, safe CSV writer for the developer export. Spreadsheet programs run a
 * cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a
 * formula, and a property name or locality is text an admin typed, so any such
 * cell is written with a leading apostrophe. Fields with a comma, quote or line
 * break are quoted; lines end in CRLF as RFC 4180 has it.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export const csvCell = (value: string | number | null): string => {
  if (value === null) return "";
  const text = typeof value === "number" ? String(value) : value;
  // A number is never a formula; only text is guarded.
  const safe =
    typeof value === "string" && FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export const toCsv = (
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string =>
  [header, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\r\n") + "\r\n";
