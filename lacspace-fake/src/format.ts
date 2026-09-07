/**
 * Output formatters: JSON (array), NDJSON (one object per line), CSV (with a
 * header row) and SQL `INSERT` statements. String values in SQL and CSV are
 * escaped so a value containing a quote can't break — or inject into — the
 * output.
 */

export type Format = "json" | "ndjson" | "csv" | "sql";

export function isFormat(v: string): v is Format {
  return v === "json" || v === "ndjson" || v === "csv" || v === "sql";
}

export interface FormatOptions {
  format: Format;
  pretty?: boolean;
  /** Required for `sql`: the target table name. */
  table?: string;
  /** For `sql`: also emit a `CREATE TABLE` DDL with inferred column types. */
  ddl?: boolean;
}

type Row = Record<string, unknown>;

/** The union of keys across rows, preserving first-seen order. */
export function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

/** Render a value into a flat CSV/SQL cell (objects/arrays become JSON text). */
function cellString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// --- CSV ------------------------------------------------------------------

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = cellString(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Row[]): string {
  const cols = columnsOf(rows);
  const lines = [cols.map(csvEscape).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  return lines.join("\n");
}

// --- SQL ------------------------------------------------------------------

/** Escape a single SQL value. Strings are single-quoted with `'` doubled. */
export function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

/** Quote a SQL identifier (table/column) defensively with double quotes. */
export function sqlIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Infer a portable SQL column type from a column's values. */
export function inferSqlType(values: unknown[]): string {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return "TEXT";
  if (present.every((v) => typeof v === "boolean")) return "BOOLEAN";
  if (present.every((v) => typeof v === "number")) {
    return present.every((v) => Number.isInteger(v as number)) ? "INTEGER" : "REAL";
  }
  if (present.every((v) => typeof v === "string" && ISO_DATETIME.test(v))) return "TIMESTAMP";
  if (present.every((v) => typeof v === "string" && ISO_DATE.test(v))) return "DATE";
  return "TEXT";
}

/** Build a `CREATE TABLE` DDL with inferred column types. */
export function toCreateTable(rows: Row[], table: string): string {
  if (!table) throw new Error("SQL output needs a --table name");
  const cols = columnsOf(rows);
  if (cols.length === 0) return `-- no columns for ${sqlIdent(table)}`;
  const defs = cols.map((c) => {
    const vals = rows.map((r) => r[c]);
    const type = inferSqlType(vals);
    const notNull = rows.length > 0 && vals.every((v) => v !== null && v !== undefined) ? " NOT NULL" : "";
    return `  ${sqlIdent(c)} ${type}${notNull}`;
  });
  return `CREATE TABLE ${sqlIdent(table)} (\n${defs.join(",\n")}\n);`;
}

export function toSql(rows: Row[], table: string, opts: { ddl?: boolean } = {}): string {
  if (!table) throw new Error("SQL output needs a --table name");
  const cols = columnsOf(rows);
  const insert =
    rows.length === 0
      ? `-- no rows for ${sqlIdent(table)}`
      : `INSERT INTO ${sqlIdent(table)} (${cols.map(sqlIdent).join(", ")}) VALUES\n${rows
          .map((r) => `  (${cols.map((c) => sqlValue(r[c])).join(", ")})`)
          .join(",\n")};`;
  return opts.ddl ? `${toCreateTable(rows, table)}\n\n${insert}` : insert;
}

// --- top-level dispatch ---------------------------------------------------

/** Format an array of rows in the requested output format. */
export function formatRows(rows: Row[], opts: FormatOptions): string {
  switch (opts.format) {
    case "json":
      return JSON.stringify(rows, null, opts.pretty ? 2 : 0);
    case "ndjson":
      return rows.map((r) => JSON.stringify(r)).join("\n");
    case "csv":
      return toCsv(rows);
    case "sql":
      return toSql(rows, opts.table ?? "", { ddl: opts.ddl });
  }
}

/**
 * Format a linked dataset (entity name → rows), e.g. from `generateDataset`.
 * `json` → one object of arrays; `sql` → a `CREATE TABLE`/`INSERT` block per
 * table (each table named by its entity); `csv`/`ndjson` → one section per
 * table, separated by a `# <table>` header.
 */
export function formatDataset(dataset: Record<string, Row[]>, opts: FormatOptions): string {
  const names = Object.keys(dataset);
  switch (opts.format) {
    case "json":
      return JSON.stringify(dataset, null, opts.pretty ? 2 : 0);
    case "sql":
      return names.map((name) => toSql(dataset[name]!, name, { ddl: opts.ddl })).join("\n\n");
    case "csv":
    case "ndjson":
      return names
        .map((name) => `# ${name}\n${formatRows(dataset[name]!, { format: opts.format })}`)
        .join("\n\n");
  }
}

/** Format an array of scalar values (single-generator mode). */
export function formatValues(values: unknown[], column: string, opts: FormatOptions): string {
  switch (opts.format) {
    case "json":
      return JSON.stringify(values, null, opts.pretty ? 2 : 0);
    case "ndjson":
      return values.map((v) => JSON.stringify(v)).join("\n");
    case "csv":
      return toCsv(values.map((v) => ({ [column]: v })));
    case "sql":
      return toSql(values.map((v) => ({ [column]: v })), opts.table ?? column, { ddl: opts.ddl });
  }
}
