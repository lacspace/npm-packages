/**
 * Data serialization + a format-agnostic converter. Turns scraped records (or
 * any tabular rows) into JSON, NDJSON, CSV or Excel and reads them back — Excel
 * via `@lacspace/xlsx`, CSV via `@lacspace/csv`. Nested values are JSON-encoded
 * for the flat formats.
 */
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { parse as csvParse, stringify as csvStringify } from "@lacspace/csv";
import { jsonToXlsx, xlsxToJson } from "@lacspace/xlsx";
import type { OutputFormat } from "./types.js";

export type DataRow = Record<string, unknown>;

/** The union of keys across all rows, in first-seen order. */
export function columnsOf(rows: DataRow[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    }
  }
  return cols;
}

function flatten(rows: DataRow[], cols: string[]): Record<string, string | number | boolean | null>[] {
  return rows.map((row) => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const c of cols) {
      const v = row[c];
      out[c] =
        v === null || v === undefined ? ""
          : typeof v === "object" ? JSON.stringify(v)
          : (v as string | number | boolean);
    }
    return out;
  });
}

/** Serialize rows to a format. Returns bytes for xlsx, a string otherwise. */
export function serializeRows(
  rows: DataRow[],
  format: OutputFormat,
  opts: { sheetName?: string } = {},
): { data: string | Uint8Array; binary: boolean } {
  if (format === "json") return { data: JSON.stringify(rows, null, 2), binary: false };
  if (format === "ndjson") {
    return { data: rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), binary: false };
  }
  const cols = columnsOf(rows);
  const flat = flatten(rows, cols);
  if (format === "csv") {
    return { data: csvStringify(flat as unknown as Record<string, string>[], { escapeFormulas: true }), binary: false };
  }
  const columns = cols.map((c) => {
    const max = Math.max(c.length, ...flat.map((r) => String(r[c] ?? "").length));
    return { header: c, width: Math.min(60, Math.max(8, max + 2)) };
  });
  return { data: jsonToXlsx(flat, { sheetName: opts.sheetName ?? "Scrape", columns }), binary: true };
}

/** Infer a format from a filename extension. Throws on unknown. */
export function detectFormat(file: string): OutputFormat {
  const ext = extname(file).toLowerCase().replace(/^\./, "");
  if (ext === "json") return "json";
  if (ext === "ndjson" || ext === "jsonl") return "ndjson";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  throw new Error(`Cannot infer a format from ".${ext}" — pass an explicit --format (json|ndjson|csv|xlsx).`);
}

/** Read a JSON / NDJSON / CSV / Excel file into rows. */
export async function readRows(file: string, format?: OutputFormat): Promise<DataRow[]> {
  const fmt = format ?? detectFormat(file);
  if (fmt === "xlsx") return (await xlsxToJson(await readFile(file))) as DataRow[];
  const text = await readFile(file, "utf8");
  if (fmt === "csv") return csvParse<DataRow>(text, { header: true });
  if (fmt === "ndjson") {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
      try { return JSON.parse(l) as DataRow; } catch { throw new Error(`Invalid NDJSON on line ${i + 1}.`); }
    });
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as DataRow[];
  if (parsed && typeof parsed === "object") return [parsed as DataRow];
  throw new Error("JSON input must be an array of objects or a single object.");
}

/** Read `input`, convert to `format`, write to `out` (or a sibling file). */
export async function convertFile(
  input: string,
  opts: { format?: OutputFormat; out?: string; sheetName?: string } = {},
): Promise<{ out: string; format: OutputFormat; count: number }> {
  const rows = await readRows(input);
  const format = opts.format ?? (opts.out ? detectFormat(opts.out) : "json");
  const out = resolve(opts.out ?? input.replace(/\.[^.]+$/, "") + "." + format);
  const { data, binary } = serializeRows(rows, format, { sheetName: opts.sheetName ?? "Scrape" });
  await writeFile(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  return { out, format, count: rows.length };
}
