import type { Row, Table, ParseOptions, SerializeOptions, ColumnType } from "../types";
import { inferSchema, inferTypes } from "../infer";
import { ConvertError, cellText, columnsOf, isDate, plainValue, safeSet } from "../util";

/* ------------------------------ writer ------------------------------ */

function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function quoteLiteral(v: unknown, dateFormat: SerializeOptions["dateFormat"]): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (isDate(v) && dateFormat === "excel") return String(plainValue(v, "excel"));
  return `'${cellText(v, dateFormat).replace(/'/g, "''")}'`;
}

function sqlType(rows: Row[], col: string, type: ColumnType): string {
  switch (type) {
    case "number": {
      const allInt = rows.every((r) => r[col] === null || r[col] === undefined || (typeof r[col] === "number" && Number.isInteger(r[col])));
      return allInt ? "INTEGER" : "REAL";
    }
    case "boolean": return "BOOLEAN";
    case "date": return "TIMESTAMP";
    default: return "TEXT";
  }
}

export function serializeSql(tables: Table[], opts: SerializeOptions): string {
  const eol = opts.eol ?? "\n";
  const out: string[] = [];
  tables.forEach((t, i) => {
    const name = t.name ?? (tables.length === 1 ? (opts.tableName ?? "data") : `${opts.tableName ?? "table"}${i + 1}`);
    const cols = opts.columns ?? columnsOf(t.rows);
    if (opts.ddl) {
      const schema = new Map(inferSchema(t.rows).map((c) => [c.name, c] as const));
      const defs = cols.map((c) => `${quoteIdent(c)} ${sqlType(t.rows, c, schema.get(c)?.type ?? "string")}`);
      out.push(`CREATE TABLE ${quoteIdent(name)} (${defs.join(", ")});`);
    }
    const colList = cols.map(quoteIdent).join(", ");
    for (const r of t.rows) {
      out.push(`INSERT INTO ${quoteIdent(name)} (${colList}) VALUES (${cols.map((c) => quoteLiteral(r[c], opts.dateFormat)).join(", ")});`);
    }
  });
  return out.join(eol) + (out.length ? eol : "");
}

/* ------------------------------ reader ------------------------------ */

type Tok = { t: "ident" | "str" | "num" | "kw" | "punct"; v: string };

function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "-" && sql[i + 1] === "-") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (ch === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (ch === "'") {
      let j = i + 1, s = "";
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { s += "'"; j += 2; continue; }
        if (sql[j] === "'") break;
        if (sql[j] === "\\" && j + 1 < n) { const c = sql[j + 1]!; s += c === "n" ? "\n" : c === "t" ? "\t" : c; j += 2; continue; }
        s += sql[j]; j++;
      }
      toks.push({ t: "str", v: s }); i = j + 1; continue;
    }
    if (ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1, s = "";
      while (j < n) {
        if (sql[j] === close && sql[j + 1] === close) { s += close; j += 2; continue; }
        if (sql[j] === close) break;
        s += sql[j]; j++;
      }
      toks.push({ t: "ident", v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(ch) || ((ch === "-" || ch === "+") && /[0-9.]/.test(sql[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n && /[0-9.eE+-]/.test(sql[j]!)) j++;
      toks.push({ t: "num", v: sql.slice(i, j) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$.]/.test(sql[j]!)) j++;
      const w = sql.slice(i, j);
      const up = w.toUpperCase();
      toks.push(["INSERT", "INTO", "VALUES", "NULL", "TRUE", "FALSE", "CREATE", "TABLE"].includes(up) ? { t: "kw", v: up } : { t: "ident", v: w });
      i = j; continue;
    }
    toks.push({ t: "punct", v: ch }); i++;
  }
  return toks;
}

/** Parse `INSERT INTO` statements (and `CREATE TABLE` column lists) back into tables, grouped by table name. */
export function parseSql(text: string, opts: ParseOptions): Table[] {
  const toks = tokenize(text);
  const tables = new Map<string, Row[]>();
  const ddlCols = new Map<string, string[]>();
  let i = 0;
  const at = (k: number): Tok | undefined => toks[k];
  const skipStatement = (): void => { while (i < toks.length && !(at(i)!.t === "punct" && at(i)!.v === ";")) i++; i++; };

  while (i < toks.length) {
    const tok = at(i)!;
    if (tok.t === "kw" && tok.v === "CREATE" && at(i + 1)?.v === "TABLE") {
      i += 2;
      while (at(i)?.t === "ident" && at(i + 1)?.v !== "(" && at(i)?.v.toUpperCase() !== "IF") i++;
      if (at(i)?.v.toUpperCase() === "IF") i += 3; // IF NOT EXISTS
      const name = at(i)?.v ?? "";
      i++;
      if (at(i)?.v === "(") {
        i++;
        const cols: string[] = [];
        let depth = 0, expectName = true;
        while (i < toks.length) {
          const t = at(i)!;
          if (t.v === "(" && t.t === "punct") depth++;
          else if (t.v === ")" && t.t === "punct") { if (depth === 0) break; depth--; }
          else if (t.v === "," && t.t === "punct" && depth === 0) expectName = true;
          else if (expectName && t.t === "ident") { if (!/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|KEY|INDEX)$/i.test(t.v)) cols.push(t.v); expectName = false; }
          i++;
        }
        ddlCols.set(name.split(".").pop() ?? name, cols);
      }
      skipStatement();
      continue;
    }
    if (!(tok.t === "kw" && tok.v === "INSERT")) { i++; continue; }
    i++;
    if (at(i)?.v === "INTO") i++;
    const nameTok = at(i);
    if (!nameTok || nameTok.t !== "ident") throw new ConvertError("SQL: expected table name after INSERT INTO");
    const name = nameTok.v.split(".").pop() ?? nameTok.v;
    i++;
    let cols: string[] | undefined;
    if (at(i)?.v === "(" && at(i)?.t === "punct") {
      i++;
      cols = [];
      while (i < toks.length && !(at(i)!.t === "punct" && at(i)!.v === ")")) {
        const t = at(i)!;
        if (t.t !== "punct") cols.push(t.v);
        i++;
      }
      i++;
    }
    if (at(i)?.v !== "VALUES") throw new ConvertError(`SQL: expected VALUES in INSERT INTO ${name}`);
    i++;
    const rows = tables.get(name) ?? [];
    tables.set(name, rows);
    // one or more (…) tuples
    while (at(i)?.v === "(" && at(i)?.t === "punct") {
      i++;
      const vals: unknown[] = [];
      let sign = 1;
      while (i < toks.length && !(at(i)!.t === "punct" && at(i)!.v === ")")) {
        const t = at(i)!;
        if (t.t === "str") vals.push(t.v);
        else if (t.t === "num") vals.push(sign * Number(t.v));
        else if (t.t === "kw") vals.push(t.v === "NULL" ? null : t.v === "TRUE" ? true : t.v === "FALSE" ? false : t.v);
        else if (t.t === "punct" && t.v === "-") { sign = -1; i++; continue; }
        else if (t.t === "ident") vals.push(t.v);
        sign = 1;
        i++;
      }
      i++;
      const keys = cols ?? ddlCols.get(name) ?? vals.map((_, k) => `col${k + 1}`);
      const row: Row = {};
      keys.forEach((k, k2) => safeSet(row, k, vals[k2] ?? null));
      rows.push(row);
      if (at(i)?.v === "," && at(i)?.t === "punct") i++;
    }
    skipStatement();
  }
  return [...tables.entries()].map(([name, rows]) => ({ name, rows: (opts.infer ?? true) ? inferTypes(rows) : rows }));
}
