import { parse as csvParse, stringify as csvStringify } from "@lacspace/csv";
import type { Row, Table, ParseOptions, SerializeOptions } from "../types";
import { inferTypes, inferCell } from "../infer";
import { cellText, columnsOf, safeSet } from "../util";

/** Pick the most frequent of `, ; \t |` on the first line. */
export function sniffDelimiter(text: string): string {
  const nl = text.indexOf("\n");
  const firstLine = text.slice(0, nl === -1 ? text.length : nl);
  let best = ",", bestN = -1;
  for (const d of [",", ";", "\t", "|"]) {
    let n = 0;
    for (let i = 0; i < firstLine.length; i++) if (firstLine[i] === d) n++;
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

export function parseCsv(text: string, format: "csv" | "tsv", opts: ParseOptions): Table[] {
  const delimiter = opts.delimiter ?? (format === "tsv" ? "\t" : sniffDelimiter(text));
  const raw = csvParse<Record<string, string>>(text, { delimiter, header: true, skipEmpty: true });
  const rows: Row[] = raw.map((r) => {
    const o: Row = {};
    for (const k of Object.keys(r)) safeSet(o, k, r[k]);
    return o;
  });
  const table: Table = { rows: (opts.infer ?? true) ? inferTypes(rows) : rows };
  if (opts.tableName) table.name = opts.tableName;
  return [table];
}

export function serializeCsv(tables: Table[], format: "csv" | "tsv", opts: SerializeOptions): string {
  const delimiter = format === "tsv" ? "\t" : (opts.delimiter ?? ",");
  const eol = opts.eol ?? "\n";
  const blocks = tables.map((t) => {
    const cols = opts.columns ?? columnsOf(t.rows);
    const textRows = t.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const c of cols) safeSet(o, c, cellText(r[c], opts.dateFormat));
      return o;
    });
    if (cols.length === 0) return "";
    return csvStringify(textRows, { delimiter, columns: cols, header: true, eol, escapeFormulas: opts.escapeFormulas ?? true });
  });
  const body = blocks.join(eol + eol);
  return (opts.bom ? "\uFEFF" : "") + body;
}

/* ------------------------------ streaming ------------------------------ */

/** Split text into CSV records (quote-aware), yielding one record's text at a time. */
function* csvRecords(text: string): Generator<string, void, undefined> {
  let start = 0, inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (!inQ && (ch === "\n" || ch === "\r")) {
      const rec = text.slice(start, i);
      if (ch === "\r" && text[i + 1] === "\n") i++;
      start = i + 1;
      if (rec.trim() !== "") yield rec;
    }
  }
  const tail = text.slice(start);
  if (tail.trim() !== "") yield tail;
}

export interface ParseLinesOptions {
  /** Called for every row as it is produced. */
  onRow?: (row: Row, index: number) => void;
  /** csv delimiter (default: sniffed). */
  delimiter?: string;
  /** Per-cell coercion (numbers / booleans / dates). Default `true`. */
  infer?: boolean;
}

/**
 * Lazily iterate rows of a csv / ndjson text without building one big array.
 * A `function*` — pull rows with `for … of`, or pass `onRow` (as a function or
 * in the options bag) to have each row handed to you as it is produced.
 * Inference is per-cell here (a streaming reader can't see the whole column).
 *
 * @example
 * for (const row of parseLines(bigCsv, "csv")) process(row);
 * // or
 * for (const _ of parseLines(bigNdjson, "ndjson", (row) => process(row)));
 */
export function* parseLines(
  text: string,
  from: "csv" | "ndjson",
  onRowOrOpts?: ParseLinesOptions | ((row: Row, index: number) => void),
): Generator<Row, void, undefined> {
  const opts: ParseLinesOptions = typeof onRowOrOpts === "function" ? { onRow: onRowOrOpts } : (onRowOrOpts ?? {});
  const infer = opts.infer ?? true;
  let index = 0;
  const emit = (row: Row): Row => { opts.onRow?.(row, index++); return row; };
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (from === "ndjson") {
    for (const rec of src.split(/\r?\n/)) {
      const l = rec.trim();
      if (l === "") continue;
      const v = JSON.parse(l) as unknown;
      yield emit(v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Row) : { value: v });
    }
    return;
  }
  const delimiter = opts.delimiter ?? sniffDelimiter(src);
  let header: string[] | null = null;
  for (const rec of csvRecords(src)) {
    const cells = csvParse(rec, { header: false, delimiter, skipEmpty: false })[0] ?? [];
    if (header === null) { header = cells.map((h, i) => (h === "" ? `col${i + 1}` : h)); continue; }
    const row: Row = {};
    header.forEach((k, i) => safeSet(row, k, infer ? inferCell(cells[i] ?? "") : (cells[i] ?? "")));
    yield emit(row);
  }
}
