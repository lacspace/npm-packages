/**
 * The extraction dispatcher — pick the right engine for a file by its type and
 * return a normalised result: text, tables and/or rows.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { readRows, type DataRow } from "lacspace-scraper";
import { extractPdfText } from "./pdf.js";
import { htmlTables, htmlText, lineTables } from "./tables.js";

export type SourceKind = "pdf" | "html" | "spreadsheet" | "text";

export interface ExtractResult {
  file: string;
  kind: SourceKind;
  /** Extracted plain text (pdf/html/text). */
  text?: string;
  /** PDF page count. */
  pageCount?: number;
  /** Tables as arrays of rows (html = header-keyed objects; pdf/text = string cells). */
  tables?: Record<string, string>[][] | string[][][];
  /** Tabular rows (spreadsheet/csv/json input). */
  rows?: DataRow[];
}

export interface ExtractOptions {
  /** Also detect tables (default: on for html, off for pdf/text unless set). */
  tables?: boolean;
  /** Force text extraction even for spreadsheets/html. */
  text?: boolean;
}

function kindOf(file: string): SourceKind {
  const ext = extname(file).toLowerCase().replace(/^\./, "");
  if (ext === "pdf") return "pdf";
  if (ext === "html" || ext === "htm") return "html";
  if (["csv", "tsv", "xlsx", "xls", "json", "ndjson", "jsonl"].includes(ext)) return "spreadsheet";
  return "text";
}

/** Extract text/tables/rows from a file. Never throws for empty results. */
export async function extractFile(file: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const kind = kindOf(file);
  const result: ExtractResult = { file, kind };

  if (kind === "pdf") {
    const { text, pageCount } = extractPdfText(await readFile(file));
    result.text = text;
    result.pageCount = pageCount;
    if (opts.tables) result.tables = lineTables(text);
    return result;
  }
  if (kind === "html") {
    const html = await readFile(file, "utf8");
    result.tables = htmlTables(html); // tables are the point of HTML extraction
    if (opts.text) result.text = htmlText(html);
    return result;
  }
  if (kind === "spreadsheet") {
    result.rows = await readRows(file);
    return result;
  }
  // plain text
  const text = await readFile(file, "utf8");
  result.text = text;
  if (opts.tables) result.tables = lineTables(text);
  return result;
}
