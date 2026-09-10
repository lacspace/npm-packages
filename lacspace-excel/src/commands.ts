/**
 * lacspace-excel — command implementations
 *
 * Every CLI command is a plain, typed, testable function here; `cli.ts` only
 * does argument parsing and file I/O. Nothing in this module touches the file
 * system, so it is safe to use from the library entry (`lacspace-excel`).
 */

import {
  parseInput,
  serialize,
  transformTable,
  toTables,
  toExcel,
  detect,
  inferSchema,
  flatten,
  type Format,
  type Row,
  type Table,
  type ColumnSchema,
  type ConvertOptions,
} from "@lacspace/convert";
import { computeColumn, check, FUNCTION_DOCS, describeFunction, type FunctionDoc, type FunctionCategory } from "@lacspace/formula";

export type { Format, Row, Table, ColumnSchema, FunctionDoc, FunctionCategory };

/* ------------------------------ formats ------------------------------ */

const EXT_TO_FORMAT: Record<string, Format> = {
  xlsx: "xlsx",
  xlsm: "xlsx",
  csv: "csv",
  tsv: "tsv",
  tab: "tsv",
  json: "json",
  ndjson: "ndjson",
  jsonl: "ndjson",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  sql: "sql",
};

/** Default file extension for each output format. */
export const FORMAT_EXTENSION: Record<Format, string> = {
  xlsx: "xlsx",
  csv: "csv",
  tsv: "tsv",
  json: "json",
  ndjson: "ndjson",
  yaml: "yaml",
  toml: "toml",
  markdown: "md",
  html: "html",
  sql: "sql",
};

/** Map a file extension (`"xlsx"`, `".CSV"`, `"yml"`, …) to a format, or `undefined`. */
export function formatFromExtension(ext: string): Format | undefined {
  const key = ext.trim().replace(/^\./, "").toLowerCase();
  return EXT_TO_FORMAT[key];
}

/** Map a file path (`"out/orders.xlsx"`) to a format by its extension, or `undefined`. */
export function formatFromPath(path: string): Format | undefined {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return formatFromExtension(base.slice(dot + 1));
}

/** Text formats (everything except xlsx). */
export function isTextFormat(format: Format): boolean {
  return format !== "xlsx";
}

/* ------------------------------ helpers ------------------------------ */

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function safeSet(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (FORBIDDEN_KEYS.has(key)) return;
  obj[key] = value;
}

function pickSheet(tables: Table[], sheet: string | number): Table {
  const t = typeof sheet === "number" ? tables[sheet] : tables.find((x) => x.name === sheet) ?? (/^\d+$/.test(sheet) ? tables[Number(sheet)] : undefined);
  if (!t) throw new Error(`Sheet not found: ${String(sheet)}`);
  return t;
}

/** Parse `"2"` → `2`, anything else stays a sheet name. */
export function parseSheetRef(value: string | number | undefined): string | number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  return /^\d+$/.test(value) ? Number(value) : value;
}

/** Parse the input — bytes or text — into tables, sniffing the format when `from` is omitted. */
export async function loadTables(input: string | Uint8Array | Row[] | Table[], from?: Format, opts: { infer?: boolean; tableName?: string } = {}): Promise<{ tables: Table[]; format: Format | undefined }> {
  if (Array.isArray(input)) return { tables: toTables(input), format: undefined };
  const format = from ?? detect(input) ?? undefined;
  if (!format) throw new Error("Could not detect the input format — pass --from <fmt>");
  const parseOpts: { infer?: boolean; tableName?: string } = {};
  if (opts.infer !== undefined) parseOpts.infer = opts.infer;
  if (opts.tableName !== undefined) parseOpts.tableName = opts.tableName;
  const tables = await parseInput(input, format, parseOpts);
  return { tables, format };
}

/* ------------------------------ convert ------------------------------ */

export interface ConvertDataOptions {
  /** Source format. Omit to sniff. */
  from?: Format;
  /** Target format. Default `"json"`. */
  to?: Format;
  /** Pick one sheet/table by name or 0-based index. */
  sheet?: string | number;
  /** Keep only these columns, in this order (applied after `flatten`). */
  columns?: string[];
  /** Rename columns `{ old: "new" }`. */
  rename?: Record<string, string>;
  /** Flatten nested objects to dotted keys. */
  flatten?: boolean;
  /** Rebuild nested objects from dotted keys. */
  unflatten?: boolean;
  /** Coerce numeric / boolean / date-looking strings (text sources). */
  infer?: boolean;
  /** Table / sheet name for nameless tables (sql, toml, multi-sheet xlsx). */
  tableName?: string;
  /** Emit `CREATE TABLE` before the `INSERT`s (sql). */
  ddl?: boolean;
  /** Pretty-print json / html. Default `true`. */
  pretty?: boolean;
  /** Prefix csv / tsv with a UTF-8 BOM. */
  bom?: boolean;
  /** csv delimiter override. */
  delimiter?: string;
}

export interface ConvertResult {
  /** The serialized output — `Uint8Array` for xlsx, a string otherwise. */
  output: string | Uint8Array;
  /** Target format actually used. */
  format: Format;
  /** Source format (sniffed or given); `undefined` for in-memory rows. */
  from: Format | undefined;
  /** Rows written across all tables. */
  rows: number;
  /** Tables / sheets written. */
  tables: number;
  /** Output size in bytes. */
  bytes: number;
}

/** Reshape tables per the convert options (sheet → flatten → columns → rename → unflatten). */
export function reshapeTables(tables: Table[], opts: Pick<ConvertDataOptions, "sheet" | "columns" | "rename" | "flatten" | "unflatten">): Table[] {
  let out = tables;
  if (opts.sheet !== undefined) out = [pickSheet(out, opts.sheet)];
  const t: Pick<ConvertOptions, "columns" | "rename" | "flatten" | "unflatten"> = {};
  if (opts.columns) t.columns = opts.columns;
  if (opts.rename) t.rename = opts.rename;
  if (opts.flatten) t.flatten = true;
  if (opts.unflatten) t.unflatten = true;
  return out.map((x) => transformTable(x, t));
}

function serializeOptions(opts: ConvertDataOptions, tables: Table[]): Parameters<typeof serialize>[2] {
  const ser: NonNullable<Parameters<typeof serialize>[2]> = {};
  if (opts.pretty !== undefined) ser.pretty = opts.pretty;
  if (opts.bom !== undefined) ser.bom = opts.bom;
  if (opts.ddl !== undefined) ser.ddl = opts.ddl;
  if (opts.tableName !== undefined) ser.tableName = opts.tableName;
  if (opts.delimiter !== undefined) ser.delimiter = opts.delimiter;
  if (opts.columns && !opts.unflatten) ser.columns = opts.columns.map((c) => opts.rename?.[c] ?? c);
  void tables;
  return ser;
}

function byteLength(output: string | Uint8Array): number {
  return typeof output === "string" ? new TextEncoder().encode(output).length : output.length;
}

/**
 * Convert between any two of the ten formats: detect → parse → reshape → serialize.
 *
 * @example
 * const { output } = await convertData('[{"a":1}]', { to: "csv" });   // "a\n1\n"
 * const { output: xlsx } = await convertData(rows, { to: "xlsx" });   // Uint8Array
 */
export async function convertData(input: string | Uint8Array | Row[] | Table[], opts: ConvertDataOptions = {}): Promise<ConvertResult> {
  const to: Format = opts.to ?? "json";
  const loadOpts: { infer?: boolean; tableName?: string } = {};
  if (opts.infer !== undefined) loadOpts.infer = opts.infer;
  if (opts.tableName !== undefined) loadOpts.tableName = opts.tableName;
  const { tables: parsed, format: from } = await loadTables(input, opts.from, loadOpts);
  const tables = reshapeTables(parsed, opts);
  const output = await serialize(tables, to, serializeOptions(opts, tables));
  return {
    output,
    format: to,
    from,
    rows: tables.reduce((n, t) => n + t.rows.length, 0),
    tables: tables.length,
    bytes: byteLength(output),
  };
}

/* ------------------------------ inspect ------------------------------ */

export interface InspectTable {
  name: string | undefined;
  rows: number;
  columns: ColumnSchema[];
  /** The first `samples` rows (plain values). */
  sample: Row[];
}

export interface InspectReport {
  format: Format | undefined;
  tables: InspectTable[];
}

export interface InspectOptions {
  /** Sample rows to include per table. Default 3. */
  samples?: number;
  /** Type inference for text sources. */
  infer?: boolean;
  /** Only this sheet. */
  sheet?: string | number;
}

/**
 * Describe the input: every table with its row count, inferred column schema
 * (name / type / nullable / samples) and the first few rows.
 */
export async function inspectData(input: string | Uint8Array | Row[] | Table[], from?: Format, opts: InspectOptions = {}): Promise<InspectReport> {
  const samples = opts.samples ?? 3;
  const loadOpts: { infer?: boolean } = {};
  if (opts.infer !== undefined) loadOpts.infer = opts.infer;
  const { tables: parsed, format } = await loadTables(input, from, loadOpts);
  const tables = opts.sheet !== undefined ? [pickSheet(parsed, opts.sheet)] : parsed;
  return {
    format,
    tables: tables.map((t) => ({
      name: t.name,
      rows: t.rows.length,
      columns: inferSchema(t.rows, { samples }),
      sample: t.rows.slice(0, samples),
    })),
  };
}

/* ------------------------------ formula ------------------------------ */

export interface FormulaAdd {
  /** New column key. */
  key: string;
  /** Formula in @lacspace/formula syntax, with or without the leading `=`. */
  formula: string;
}

/** Error thrown for a formula that does not parse or evaluate. */
export class FormulaColumnError extends Error {
  constructor(
    message: string,
    public readonly key: string,
    public readonly formula: string,
    public readonly position?: number,
  ) {
    super(message);
    this.name = "FormulaColumnError";
  }
}

/** Parse a CLI `--add "key=formula"` spec. */
export function parseFormulaAdd(spec: string): FormulaAdd {
  const eq = spec.indexOf("=");
  if (eq <= 0) throw new Error(`Invalid --add "${spec}" — expected key=<formula>, e.g. amount=qty*rate`);
  const key = spec.slice(0, eq).trim();
  const formula = spec.slice(eq + 1).trim();
  if (!key) throw new Error(`Invalid --add "${spec}" — the column key is empty`);
  if (!formula) throw new Error(`Invalid --add "${spec}" — the formula for "${key}" is empty`);
  if (FORBIDDEN_KEYS.has(key)) throw new Error(`Invalid --add "${spec}" — "${key}" is not an allowed column key`);
  return { key, formula };
}

/** Validate every add up front; throws {@link FormulaColumnError} (with the position when known) on the first bad one. */
export function validateFormulaAdds(adds: FormulaAdd[]): void {
  for (const add of adds) {
    if (FORBIDDEN_KEYS.has(add.key)) throw new FormulaColumnError(`"${add.key}" is not an allowed column key`, add.key, add.formula);
    const result = check(add.formula);
    if (!result.ok) {
      const where = result.position !== undefined ? ` at position ${result.position}` : "";
      throw new FormulaColumnError(`Invalid formula for "${add.key}"${where}: ${result.error}`, add.key, add.formula, result.position);
    }
  }
}

/**
 * Add computed columns to rows. Rows are flattened first (so `address.city`
 * is addressable), then each formula is evaluated over every row in order —
 * a later add can reference the columns produced by an earlier one. Returns
 * new row objects; the input is not mutated. Throws on an invalid formula.
 *
 * @example
 * addFormulaColumns([{ qty: 2, rate: 5 }], [{ key: "amount", formula: "=qty*rate" }]);
 * // [{ qty: 2, rate: 5, amount: 10 }]
 */
export function addFormulaColumns(rows: Row[], adds: FormulaAdd[]): Row[] {
  validateFormulaAdds(adds);
  let out: Row[] = rows.map((r) => flatten(r));
  for (const add of adds) {
    let values: unknown[];
    try {
      values = computeColumn(add.formula, out);
    } catch (e) {
      throw new FormulaColumnError(`Formula for "${add.key}" failed: ${e instanceof Error ? e.message : String(e)}`, add.key, add.formula);
    }
    out = out.map((r, i) => {
      const next: Row = { ...r };
      const v = values[i];
      safeSet(next, add.key, typeof v === "number" && !Number.isFinite(v) ? null : v === undefined ? null : v);
      return next;
    });
  }
  return out;
}

/* ------------------------------ dedupe ------------------------------ */

function keyValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return "d:" + v.toISOString();
  if (typeof v === "object") return "o:" + JSON.stringify(v);
  return typeof v + ":" + String(v);
}

function rowKey(row: Row, by: string[] | undefined): string {
  const keys = by ?? Object.keys(row).sort();
  return keys.map((k) => k + " " + keyValue(row[k])).join("");
}

export interface DedupeResult {
  rows: Row[];
  /** How many rows were dropped. */
  removed: number;
}

/**
 * Drop duplicate rows, keeping the first occurrence. Compares every column
 * (order-insensitive) unless `by` names the key columns.
 *
 * @example
 * dedupeRows([{ sku: "A", n: 1 }, { sku: "A", n: 2 }], ["sku"]);  // { rows: [{ sku: "A", n: 1 }], removed: 1 }
 */
export function dedupeRows(rows: Row[], by?: string[]): DedupeResult {
  const keys = by && by.length > 0 ? by : undefined;
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const k = rowKey(r, keys);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, removed: rows.length - out.length };
}

/* ------------------------------ split / merge ------------------------------ */

export interface NamedTable {
  name: string;
  rows: Row[];
}

/** Read an .xlsx workbook into one `{ name, rows }` per sheet. */
export async function splitWorkbook(bytes: Uint8Array, opts: { infer?: boolean } = {}): Promise<NamedTable[]> {
  const parseOpts: { infer?: boolean } = {};
  if (opts.infer !== undefined) parseOpts.infer = opts.infer;
  const tables = await parseInput(bytes, "xlsx", parseOpts);
  return tables.map((t, i) => ({ name: t.name ?? `Sheet${i + 1}`, rows: t.rows }));
}

/** Excel sheet names: max 31 chars, none of `[ ] : * ? / \`, not empty. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31);
  return cleaned || "Sheet";
}

/** Make every sheet name unique (`Orders`, `Orders (2)`, …) while staying within 31 chars. */
export function uniqueSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = sanitizeSheetName(raw);
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      const suffix = ` (${n++})`;
      candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** Sheet name for a file path: basename without extension, sanitized. */
export function sheetNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "Sheet";
  const dot = base.lastIndexOf(".");
  return sanitizeSheetName(dot > 0 ? base.slice(0, dot) : base);
}

/**
 * Combine tables into one workbook — one sheet per table, in order, names
 * sanitized and de-duplicated. Returns .xlsx bytes.
 */
export function mergeTables(tables: NamedTable[] | Table[]): Uint8Array {
  if (tables.length === 0) throw new Error("merge needs at least one table");
  const names = uniqueSheetNames(tables.map((t, i) => t.name ?? `Sheet${i + 1}`));
  return toExcel(tables.map((t, i) => ({ name: names[i]!, rows: t.rows })));
}

/* ------------------------------ functions ------------------------------ */

export interface FunctionGroup {
  category: FunctionCategory;
  functions: FunctionDoc[];
}

const CATEGORY_ORDER: FunctionCategory[] = ["math", "statistics", "logic", "text", "date", "lookup", "info"];

/** All formula functions grouped by category, or one function's doc (`undefined` when unknown). */
export function functionReference(): FunctionGroup[];
export function functionReference(name: string): FunctionDoc | undefined;
export function functionReference(name?: string): FunctionGroup[] | FunctionDoc | undefined {
  if (name !== undefined) return describeFunction(name.trim().toUpperCase().replace(/^=/, "").replace(/\(.*$/, ""));
  const groups = new Map<FunctionCategory, FunctionDoc[]>();
  for (const doc of FUNCTION_DOCS) {
    const list = groups.get(doc.category) ?? [];
    list.push(doc);
    groups.set(doc.category, list);
  }
  const order = [...CATEGORY_ORDER, ...[...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  return order.filter((c) => groups.has(c)).map((c) => ({ category: c, functions: [...groups.get(c)!].sort((a, b) => a.name.localeCompare(b.name)) }));
}

/* ------------------------------ misc ------------------------------ */

/** `12345` → `"12.1 KB"`. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
