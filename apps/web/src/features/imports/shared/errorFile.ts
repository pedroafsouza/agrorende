import type { ImportParseError } from "./parser";

const csvHeader = "row;column;code;value";

function sanitizeCell(value: string): string {
  const escaped = value.replaceAll('"', '""');
  const safe = /^[=+\-@]/.test(escaped) ? `'${escaped}` : escaped;
  return `"${safe}"`;
}

export function buildImportErrorCsv(errors: readonly ImportParseError[]): string {
  const rows = errors.map((error) => [String(error.row), String(error.column), error.code, error.value].map(sanitizeCell).join(";"));
  return [csvHeader, ...rows].join("\n");
}

export function downloadImportErrorFile(errors: readonly ImportParseError[], filename: string): void {
  const blob = new Blob([buildImportErrorCsv(errors)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
