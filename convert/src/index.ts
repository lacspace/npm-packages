/**
 * @lacspace/convert
 *
 * The data-conversion hub of the Lacspace Sheets Kit — read tabular or
 * structured data in any of ten formats (json, ndjson, csv, tsv, xlsx, yaml,
 * toml, markdown, html, sql), normalise it to `Table[]`, optionally reshape
 * it (pick a sheet, select / rename columns, flatten / unflatten nested
 * objects, infer types) and write it back out in any other format. Zero
 * external dependencies (only sibling @lacspace/csv + @lacspace/xlsx),
 * isomorphic, TypeScript-first.
 *
 * @example
 * import { convert } from "@lacspace/convert";
 * const csv = await convert('[{"name":"Ada","born":"1815-12-10"}]', { to: "csv" });
 * const xlsx = await convert(csv, { to: "xlsx" });            // Uint8Array
 * const yaml = await convert(xlsx, { from: "xlsx", to: "yaml", sheet: 0 });
 */
import type { Format, Row, Table, ParseOptions, SerializeOptions, ConvertOptions } from "./types";
import { ConvertError, decodeText, isPlainObject, safeSet } from "./util";
import { detect } from "./detect";
import { flatten, unflatten } from "./flatten";
import { parseJson, parseNdjson, serializeJson, serializeNdjson } from "./formats/json";
import { parseCsv, serializeCsv } from "./formats/csv";
import { parseXlsx, serializeXlsx } from "./formats/xlsx";
import { parseMarkdown, serializeMarkdown } from "./formats/markdown";
import { parseHtml, serializeHtml } from "./formats/html";
import { parseSql, serializeSql } from "./formats/sql";
import { parseYamlTables, parseTomlTables, serializeYaml, serializeToml } from "./formats/yamltoml";

/* ------------------------------ parse ------------------------------ */

/**
 * Parse any supported input into an array of tables. `from` is sniffed with
 * `detect()` when omitted. Always returns `Table[]` — one per xlsx sheet,
 * html `<table>`, markdown pipe table, sql target table or json/yaml/toml
 * top-level key (when the value is an object of row arrays); otherwise a
 * single table.
 *
 * @example
 * const [users] = await parseInput("id,name\n1,Ada", "csv");
 * users.rows; // [{ id: 1, name: "Ada" }]  (types inferred)
 */
export async function parseInput(input: string | Uint8Array, from?: Format, opts: ParseOptions = {}): Promise<Table[]> {
  const format = from ?? detect(input);
  if (!format) throw new ConvertError("Could not detect the input format — pass `from` explicitly");
  if (format === "xlsx") {
    if (typeof input === "string") throw new ConvertError("xlsx input must be bytes (Uint8Array)");
    return parseXlsx(input, opts);
  }
  const text = decodeText(input);
  let tables: Table[];
  switch (format) {
    case "json": tables = parseJson(text); break;
    case "ndjson": tables = parseNdjson(text); break;
    case "csv":
    case "tsv": return parseCsv(text, format, opts);
    case "yaml": tables = parseYamlTables(text); break;
    case "toml": tables = parseTomlTables(text); break;
    case "markdown": return parseMarkdown(text, opts);
    case "html": return parseHtml(text, opts);
    case "sql": return parseSql(text, opts);
    default: throw new ConvertError(`Unsupported input format: ${String(format)}`);
  }
  if (opts.infer) tables = tables.map((t) => ({ ...t, rows: inferTypes(t.rows) }));
  if (opts.tableName && tables.length === 1 && !tables[0]!.name) tables[0]!.name = opts.tableName;
  return tables;
}

/* ------------------------------ serialize ------------------------------ */

/**
 * Write tables in the target format. `xlsx` returns `Uint8Array` (one sheet
 * per table, Date cells kept as real dates with a date number-format); every
 * other format returns a string. csv/tsv are formula-injection safe by
 * default (`escapeFormulas: true`).
 *
 * @example
 * await serialize([{ rows: [{ a: 1, b: "x" }] }], "markdown");
 * // "| a | b |\n| --- | --- |\n| 1 | x |\n"
 * await serialize([{ name: "users", rows }], "sql", { ddl: true });
 * // CREATE TABLE "users" (...); INSERT INTO "users" (...) VALUES (...);
 */
export async function serialize(tables: Table[], to: Format, opts: SerializeOptions = {}): Promise<string | Uint8Array> {
  switch (to) {
    case "json": return serializeJson(tables, opts);
    case "ndjson": return serializeNdjson(tables, opts);
    case "csv":
    case "tsv": return serializeCsv(tables, to, opts);
    case "xlsx": return serializeXlsx(tables, opts);
    case "yaml": return serializeYaml(tables, opts);
    case "toml": return serializeToml(tables, opts);
    case "markdown": return serializeMarkdown(tables, opts);
    case "html": return serializeHtml(tables, opts);
    case "sql": return serializeSql(tables, opts);
    default: throw new ConvertError(`Unsupported output format: ${String(to)}`);
  }
}

/* ------------------------------ transforms ------------------------------ */

function pickSheet(tables: Table[], sheet: string | number): Table {
  const t = typeof sheet === "number" ? tables[sheet] : tables.find((x) => x.name === sheet);
  if (!t) throw new ConvertError(`Sheet not found: ${String(sheet)}`);
  return t;
}

/** Apply the column-level reshaping from ConvertOptions to one table. */
export function transformTable(table: Table, opts: Pick<ConvertOptions, "columns" | "rename" | "flatten" | "unflatten">): Table {
  let rows = table.rows;
  if (opts.flatten) rows = rows.map((r) => flatten(r));
  if (opts.columns) {
    const cols = opts.columns;
    rows = rows.map((r) => {
      const o: Row = {};
      for (const c of cols) safeSet(o, c, r[c]);
      return o;
    });
  }
  if (opts.rename) {
    const map = opts.rename;
    rows = rows.map((r) => {
      const o: Row = {};
      for (const k of Object.keys(r)) safeSet(o, map[k] ?? k, r[k]);
      return o;
    });
  }
  if (opts.unflatten) rows = rows.map((r) => unflatten(r));
  return { ...table, rows };
}

/* ------------------------------ convert ------------------------------ */

/**
 * The one-call API: detect → parse → reshape → serialize.
 *
 * Transforms run in this order: `sheet` (pick one table) → `flatten` →
 * `columns` (select + reorder) → `rename` → `unflatten`. Returns
 * `Uint8Array` for `to: "xlsx"`, a string otherwise.
 *
 * @example
 * await convert(csvText, { to: "json" });
 * await convert(xlsxBytes, { to: "csv", sheet: "Orders", columns: ["id", "total"] });
 * await convert(nestedJson, { to: "xlsx", flatten: true });      // address.city columns
 * await convert(flatCsv, { to: "json", unflatten: true });       // back to nested objects
 * await convert(rows, { to: "sql", tableName: "users", ddl: true });
 */
export async function convert(input: string | Uint8Array | Row[] | Table[], opts: ConvertOptions): Promise<string | Uint8Array> {
  let tables: Table[];
  if (Array.isArray(input)) tables = toTables(input);
  else {
    const from = opts.from ?? detect(input);
    if (!from) throw new ConvertError("Could not detect the input format — pass `from` explicitly");
    const parseOpts: ParseOptions = {};
    if (opts.infer !== undefined) parseOpts.infer = opts.infer;
    if (opts.delimiter !== undefined && (from === "csv" || from === "tsv")) parseOpts.delimiter = opts.delimiter;
    if (opts.tableName !== undefined) parseOpts.tableName = opts.tableName;
    tables = await parseInput(input, from, parseOpts);
  }
  if (opts.sheet !== undefined) tables = [pickSheet(tables, opts.sheet)];
  tables = tables.map((t) => transformTable(t, opts));
  const { from: _f, to, sheet: _s, rename: _r, flatten: _fl, unflatten: _u, infer: _i, columns: _c, ...rest } = opts;
  void _f; void _s; void _r; void _fl; void _u; void _i; void _c;
  const serOpts: SerializeOptions = { ...rest };
  if (opts.columns && !opts.unflatten) serOpts.columns = opts.columns.map((c) => opts.rename?.[c] ?? c);
  return serialize(tables, to, serOpts);
}

/** `Row[]` or `Table[]` → `Table[]`. */
export function toTables(input: Row[] | Table[]): Table[] {
  if (input.length === 0) return [{ rows: [] }];
  const first = input[0]!;
  if (isPlainObject(first) && Array.isArray((first as Record<string, unknown>).rows) && Object.keys(first).every((k) => k === "rows" || k === "name")) return input as Table[];
  return [{ rows: input as Row[] }];
}

/* ------------------------------ excel helpers ------------------------------ */

/**
 * Rows or tables → .xlsx bytes (sync). One sheet per table.
 *
 * @example
 * const bytes = toExcel([{ id: 1, when: new Date() }]);
 */
export function toExcel(input: Row[] | Table[], opts: SerializeOptions = {}): Uint8Array {
  return serializeXlsx(toTables(input), opts);
}

/**
 * .xlsx bytes → tables, or one sheet's rows when `sheet` (name / index) is given.
 *
 * @example
 * const tables = await fromExcel(bytes);              // Table[]
 * const rows = await fromExcel(bytes, { sheet: 0 });  // Row[]
 */
export function fromExcel(bytes: Uint8Array, opts: ParseOptions & { sheet: string | number }): Promise<Row[]>;
export function fromExcel(bytes: Uint8Array, opts?: ParseOptions & { sheet?: undefined }): Promise<Table[]>;
export async function fromExcel(bytes: Uint8Array, opts: ParseOptions & { sheet?: string | number } = {}): Promise<Row[] | Table[]> {
  const tables = await parseXlsx(bytes, opts);
  if (opts.sheet === undefined) return tables;
  return pickSheet(tables, opts.sheet).rows;
}

/* ------------------------------ re-exports ------------------------------ */

import { inferTypes } from "./infer";
export { detect } from "./detect";
export { flatten, unflatten, parseFlatKey, type FlattenOptions } from "./flatten";
export { inferTypes, inferSchema, inferCell, parseNumber, parseBoolean, parseDate } from "./infer";
export { parseLines, sniffDelimiter, type ParseLinesOptions } from "./formats/csv";
export { tablesFromValue } from "./formats/json";
export { parseYaml, stringifyYaml } from "./yaml";
export { parseToml, stringifyToml } from "./toml";
export { ConvertError, dateToExcelSerial, excelSerialToDate, dateToIso } from "./util";
export { FORMATS } from "./types";
export type { Format, Row, Table, ParseOptions, SerializeOptions, ConvertOptions, ColumnType, ColumnSchema } from "./types";
export type { DateFormat, JsonValue, JsonObject } from "./util";
