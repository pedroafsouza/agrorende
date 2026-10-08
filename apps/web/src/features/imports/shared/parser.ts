export interface ImportRow {
  readonly rowNumber: number;
  readonly values: readonly string[];
}

export interface ImportParseError {
  readonly row: number;
  readonly column: number;
  readonly code: string;
  readonly value: string;
}

export interface ImportPreview {
  readonly headers: readonly string[];
  readonly rows: readonly ImportRow[];
  readonly errors: readonly ImportParseError[];
}

function splitLine(line: string, delimiter: "," | ";"): readonly string[] {
  return line.split(delimiter).map((value) => value.trim());
}

function detectDelimiter(header: string): "," | ";" {
  return header.includes(";") ? ";" : ",";
}

export function parseImportPreview(input: string): ImportPreview {
  const normalized = input.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  const firstLine = lines[0];
  if (firstLine === undefined) {
    return { headers: [], rows: [], errors: [] };
  }

  const delimiter = detectDelimiter(firstLine);
  const headers = splitLine(firstLine, delimiter);
  const rows: ImportRow[] = [];
  const errors: ImportParseError[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const values = splitLine(line, delimiter);
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      errors.push({ row: rowNumber, column: values.length + 1, code: "COLUMN_COUNT_MISMATCH", value: line });
    }
    rows.push({ rowNumber, values });
  }

  return { headers, rows, errors };
}
