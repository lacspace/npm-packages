/**
 * Batch input parsing: turn a `.csv` or `.txt` list into `{ id, data }` rows so
 * the CLI can emit one QR file per row. The CSV parser is a small hand-written
 * one (quoted fields, escaped quotes, commas in quotes). Zero dependencies.
 */

export interface BatchRow {
  id: string;
  data: string;
}

/** Parse a single CSV line into fields (RFC-4180-ish: quotes + `""` escape). */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

const ID_HEADERS = ["id", "name", "key", "label", "filename"];
const DATA_HEADERS = ["data", "text", "url", "content", "value", "payload", "qr"];

/**
 * Parse the contents of a batch file. `.csv` detects an optional header row and
 * an id/data column; `.txt` (or anything else) treats each non-empty line as a
 * payload, numbering rows from 1.
 */
export function parseBatch(contents: string, kind: "csv" | "txt"): BatchRow[] {
  const rawLines = contents.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (rawLines.length === 0) return [];

  if (kind === "txt") {
    return rawLines.map((line, i) => ({ id: String(i + 1), data: line.trim() }));
  }

  const rows = rawLines.map(parseCsvLine);
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const hasHeader = header.some((h) => ID_HEADERS.includes(h) || DATA_HEADERS.includes(h));

  let idCol = -1;
  let dataCol = 0;
  let body = rows;
  if (hasHeader) {
    idCol = header.findIndex((h) => ID_HEADERS.includes(h));
    const d = header.findIndex((h) => DATA_HEADERS.includes(h));
    dataCol = d >= 0 ? d : idCol === 0 ? 1 : 0;
    body = rows.slice(1);
  } else if (rows[0]!.length >= 2) {
    // No header: assume "id,data" when there are ≥2 columns.
    idCol = 0;
    dataCol = 1;
  }

  const out: BatchRow[] = [];
  for (let i = 0; i < body.length; i++) {
    const cols = body[i]!;
    const data = (cols[dataCol] ?? "").trim();
    if (data === "") continue;
    const id = idCol >= 0 && (cols[idCol] ?? "").trim() !== "" ? cols[idCol]!.trim() : String(i + 1);
    out.push({ id, data });
  }
  return out;
}

/** Make a row id safe to use as a filename. */
export function safeFilename(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "qr";
}
