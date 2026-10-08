export const CSV_BOM = "\uFEFF";
export const CSV_SEPARATOR = ";";
export const CSV_EOL = "\r\n";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Neutralises spreadsheet formula injection (OWASP CSV injection) by prefixing a quote. */
export function sanitizeCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  if (/[";\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Text cells are sanitized; numeric cells were already formatted by the caller and are trusted. */
export type CsvCell = { readonly text: string } | { readonly raw: string };

export function csvLine(cells: readonly CsvCell[]): string {
  return cells.map((cell) => quote("text" in cell ? sanitizeCell(cell.text) : cell.raw)).join(CSV_SEPARATOR) + CSV_EOL;
}
