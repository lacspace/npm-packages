import type { DateFormat } from "./util";

/** Every format the hub can read and write. */
export type Format = "json" | "ndjson" | "csv" | "tsv" | "xlsx" | "yaml" | "toml" | "markdown" | "html" | "sql";

/** All formats, in detection order. */
export const FORMATS: readonly Format[] = ["json", "ndjson", "csv", "tsv", "xlsx", "yaml", "toml", "markdown", "html", "sql"];

/** A single record — one object per row. */
export type Row = Record<string, unknown>;

/** A named list of rows. A workbook is just `Table[]`. */
export interface Table {
  name?: string;
  rows: Row[];
}

export interface ParseOptions {
  /**
   * Coerce numeric / boolean / date-looking strings to real values (per
   * column, only when the whole column agrees). Default `true` for text
   * sources (csv, tsv, html, markdown, sql), `false` for typed sources
   * (json, ndjson, yaml, toml, xlsx).
   */
  infer?: boolean;
  /** Field delimiter for csv input (default: sniffed among `,` `;` `\t` `|`). */
  delimiter?: string;
  /** Table name to give a nameless single table (csv, markdown …). */
  tableName?: string;
}

export interface SerializeOptions {
  /** Pretty-print json / html output. Default `true`. */
  pretty?: boolean;
  /** Prefix csv / tsv text with a UTF-8 BOM (Excel-friendly). Default `false`. */
  bom?: boolean;
  /** Emit `CREATE TABLE` DDL before the `INSERT`s (sql only). Default `false`. */
  ddl?: boolean;
  /** Name for nameless tables (sql / toml / multi-table outputs). Default `"data"`. */
  tableName?: string;
  /**
   * How Date cells are written in text formats: `"iso"` (default) →
   * `2024-01-05` / `2024-01-05T10:30:00.000Z`, `"excel"` → serial day number,
   * `"keep"` → same as iso for text, native Date cells for xlsx.
   */
  dateFormat?: DateFormat;
  /** Field delimiter override for csv output. */
  delimiter?: string;
  /** Line ending for csv / tsv / ndjson / sql. Default `"\n"`. */
  eol?: string;
  /**
   * Prefix cells starting with `= + - @` with `'` so spreadsheets never
   * execute them (csv / tsv). Default `true` — turn off only for trusted data.
   */
  escapeFormulas?: boolean;
  /** Explicit column order (all formats). Defaults to first-seen key order. */
  columns?: string[];
}

export interface ConvertOptions extends ParseOptions, SerializeOptions {
  /** Source format. Omit to sniff with `detect()`. */
  from?: Format;
  /** Target format. */
  to: Format;
  /** Pick one table/sheet by name or 0-based index before writing. */
  sheet?: string | number;
  /** Keep only these columns, in this order (applied after `flatten`). */
  columns?: string[];
  /** Rename columns: `{ old: "new" }` (applied after `columns`). */
  rename?: Record<string, string>;
  /** Flatten nested objects to dotted keys (`address.city`, `items.0.sku`). */
  flatten?: boolean;
  /** Rebuild nested objects from dotted keys (applied last). */
  unflatten?: boolean;
}

/** Inferred column type. */
export type ColumnType = "string" | "number" | "boolean" | "date" | "null" | "object";

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  samples: unknown[];
}
