/**
 * @lacspace/xlsx — CSV helpers
 *
 * Zero-dependency CSV <-> XLSX conversion, built on the same primitives as the
 * rest of the package. A CSV string (or a parsed rows array) becomes a real
 * `.xlsx` workbook, and any `.xlsx` becomes CSV text — round-trippable both
 * ways. The parser is RFC-4180-ish: it handles quoted fields, embedded
 * delimiters/quotes/newlines, `""` escapes and CRLF or LF line endings.
 */

import { aoaToXlsx, readWorkbook, XlsxReadError } from "./index";
import type { CellValue, ReadCell, ReadSheet, SheetOptions } from "./index";

/* ------------------------------ options ------------------------------ */

export interface CsvParseOptions {
  /** Field delimiter — a single character (default `","`). */
  delimiter?: string;
}

export interface CsvToAoaOptions extends CsvParseOptions {
  /**
   * Coerce numeric (`"12"`, `"3.5"`) and boolean (`"true"`/`"false"`) fields to
   * real JS types; blanks become `null`. Default `true`. Set `false` to keep
   * every field a string. Numbers are only coerced when they round-trip exactly,
   * so values like `"007"` or `"+1 555"` are preserved as strings.
   */
  typed?: boolean;
}

export interface AoaToCsvOptions {
  /** Field delimiter — a single character (default `","`). */
  delimiter?: string;
  /** Line terminator between rows (default `"\r\n"`). */
  newline?: string;
}

export interface CsvToXlsxOptions extends CsvToAoaOptions, SheetOptions {
  /** Name of the single sheet produced (default `"Sheet1"`). */
  sheetName?: string;
}

export interface XlsxToCsvOptions extends AoaToCsvOptions {
  /** Which sheet to serialize — name or 0-based index (default the first). */
  sheet?: string | number;
}

/* ------------------------------ parse ------------------------------ */

/**
 * Parse CSV text into a grid of raw string fields. Quoted fields may contain
 * the delimiter, newlines and `""`-escaped quotes; rows may end with CRLF or LF.
 *
 * @example
 * parseCsv('a,b\n"x,y",z'); // [["a","b"],["x,y","z"]]
 */
export function parseCsv(text: string, opts: CsvParseOptions = {}): string[][] {
  const delim = opts.delimiter ?? ",";
  if (delim.length !== 1) throw new Error("CSV delimiter must be a single character");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // any content seen on the current (not-yet-flushed) row
  const n = text.length;

  const pushField = (): void => { row.push(field); field = ""; };
  const pushRow = (): void => { rows.push(row); row = []; started = false; };

  for (let i = 0; i < n; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; started = true; continue; }
    if (ch === delim) { pushField(); started = true; continue; }
    if (ch === "\r") { pushField(); pushRow(); if (text[i + 1] === "\n") i++; continue; }
    if (ch === "\n") { pushField(); pushRow(); continue; }
    field += ch; started = true;
  }
  // Flush a trailing row that has no terminating newline.
  if (started || field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  return rows;
}

/**
 * Parse CSV text into a typed grid (`CellValue[][]`): numbers, booleans and
 * `null` for blanks, unless `typed:false` keeps every field a string.
 */
export function csvToAoa(text: string, opts: CsvToAoaOptions = {}): CellValue[][] {
  const raw = parseCsv(text, opts);
  if (opts.typed === false) return raw as CellValue[][];
  return raw.map((r) => r.map(coerce));
}

function coerce(s: string): CellValue {
  if (s === "") return null;
  const low = s.toLowerCase();
  if (low === "true") return true;
  if (low === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) {
    const num = Number(s);
    // Only coerce when it round-trips exactly (guards "007", "3.140", "1e3"…).
    if (Number.isFinite(num) && String(num) === s) return num;
  }
  return s;
}

/* ------------------------------ serialize ------------------------------ */

function isoFromDate(d: Date): string {
  const iso = d.toISOString();
  // Date-only (UTC midnight) → "YYYY-MM-DD"; otherwise full ISO timestamp.
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/**
 * Serialize a grid of cells to CSV text. `Date`s become ISO strings, booleans
 * `"true"`/`"false"`, `null`/`undefined` empty fields; anything containing the
 * delimiter, a quote or a newline is quoted with `""` escaping.
 */
export function aoaToCsv(rows: (CellValue[] | ReadCell[])[], opts: AoaToCsvOptions = {}): string {
  const delim = opts.delimiter ?? ",";
  const nl = opts.newline ?? "\r\n";
  const cell = (v: CellValue | ReadCell): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (v instanceof Date) s = isoFromDate(v);
    else if (typeof v === "boolean") s = v ? "true" : "false";
    else s = String(v);
    return s.includes(delim) || s.includes('"') || s.includes("\n") || s.includes("\r")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return rows.map((r) => r.map(cell).join(delim)).join(nl);
}

/* ------------------------------ xlsx bridge ------------------------------ */

/**
 * Convert CSV text straight to `.xlsx` bytes. Values are typed by default
 * (pass `typed:false` to keep strings); pass `header:true` for a bold header
 * row, plus any {@link SheetOptions} (`columns`, widths, `numFmt`…).
 *
 * @example
 * const bytes = csvToXlsx("name,age\nAda,36\nBob,41", { header: true });
 */
export function csvToXlsx(csv: string, opts: CsvToXlsxOptions = {}): Uint8Array {
  const aoa = csvToAoa(csv, opts);
  return aoaToXlsx(aoa, opts);
}

/**
 * Read a `.xlsx` workbook and serialize one sheet (name or index, default the
 * first) to CSV text. Async because reading may need to inflate DEFLATE parts.
 *
 * @example
 * const csv = await xlsxToCsv(bytes, { sheet: "Products" });
 */
export async function xlsxToCsv(
  input: Uint8Array | ArrayBuffer | ArrayBufferView,
  opts: XlsxToCsvOptions = {},
): Promise<string> {
  const wb = await readWorkbook(input);
  let sheet: ReadSheet | undefined;
  if (typeof opts.sheet === "number") sheet = wb.sheets[opts.sheet];
  else if (typeof opts.sheet === "string") sheet = wb.sheet(opts.sheet);
  else sheet = wb.sheets[0];
  if (!sheet) throw new XlsxReadError(`Sheet not found: ${String(opts.sheet)}`);
  return aoaToCsv(sheet.rows, opts);
}
