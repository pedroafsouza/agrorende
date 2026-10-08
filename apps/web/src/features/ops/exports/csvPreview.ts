/** UTF-8 byte-order mark written by the exporter so Excel pt-BR opens accents correctly. */
const BOM = "\uFEFF";

/**
 * Parses the first rows of an exported CSV (`;` separator, RFC 4180 quoting, optional BOM) for the
 * on-screen preview. Cells are returned verbatim: a sanitised cell such as `'=SUM(A1)` stays text.
 */
export function parseCsvPreview(text: string, maxRows = 20, separator = ";"): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length >= maxRows + 1) return rows;
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** `Blob.text()` with a `FileReader` fallback for engines (older Safari, jsdom) that lack it. */
export function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("BLOB_READ_FAILED"));
    reader.readAsText(blob, "utf-8");
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
