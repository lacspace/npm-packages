import type { Row, Table, SerializeOptions } from "../types";
import { ConvertError, isPlainObject, plainValue, safeSet, columnsOf } from "../util";

/** Normalise an arbitrary parsed value (json / yaml / toml) into tables. */
export function tablesFromValue(value: unknown, name?: string): Table[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ ...(name ? { name } : {}), rows: [] }];
    if (value.every((v) => isPlainObject(v))) return [{ ...(name ? { name } : {}), rows: value as Row[] }];
    if (value.every((v) => Array.isArray(v))) {
      // array-of-arrays: first row is the header
      const [head, ...body] = value as unknown[][];
      const keys = (head ?? []).map((h, i) => (h === null || h === undefined || h === "" ? `col${i + 1}` : String(h)));
      const rows = body.map((r) => {
        const o: Row = {};
        keys.forEach((k, i) => safeSet(o, k, r[i] ?? null));
        return o;
      });
      return [{ ...(name ? { name } : {}), rows }];
    }
    return [{ ...(name ? { name } : {}), rows: value.map((v) => (isPlainObject(v) ? (v as Row) : { value: v })) }];
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const allTables = keys.length > 0 && keys.every((k) => Array.isArray(value[k]) && (value[k] as unknown[]).every((v) => isPlainObject(v)));
    if (allTables) return keys.map((k) => ({ name: k, rows: value[k] as Row[] }));
    return [{ ...(name ? { name } : {}), rows: [value as Row] }];
  }
  if (value === null || value === undefined) return [{ ...(name ? { name } : {}), rows: [] }];
  return [{ ...(name ? { name } : {}), rows: [{ value }] }];
}

export function parseJson(text: string): Table[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch (e) { throw new ConvertError(`Invalid JSON: ${(e as Error).message}`); }
  return tablesFromValue(value);
}

export function parseNdjson(text: string): Table[] {
  const rows: Row[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (l === "") continue;
    let v: unknown;
    try { v = JSON.parse(l); } catch (e) { throw new ConvertError(`Invalid NDJSON at line ${i + 1}: ${(e as Error).message}`); }
    rows.push(isPlainObject(v) ? (v as Row) : { value: v });
  }
  return [{ rows }];
}

/** Rows → plain JSON-ready rows (Dates → iso/serial, undefined → null), honouring column order. */
export function plainRows(rows: Row[], opts: SerializeOptions): Record<string, unknown>[] {
  const cols = opts.columns ?? columnsOf(rows);
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of cols) safeSet(o, c, plainValue(r[c], opts.dateFormat ?? "iso", "keep"));
    return o;
  });
}

/** Single table → array; multiple → `{ [name]: rows }`. */
export function jsonValueOf(tables: Table[], opts: SerializeOptions): unknown {
  if (tables.length === 1) return plainRows(tables[0]!.rows, opts);
  const out: Record<string, unknown> = {};
  tables.forEach((t, i) => safeSet(out, t.name ?? `${opts.tableName ?? "table"}${i + 1}`, plainRows(t.rows, opts)));
  return out;
}

export function serializeJson(tables: Table[], opts: SerializeOptions): string {
  return JSON.stringify(jsonValueOf(tables, opts), null, (opts.pretty ?? true) ? 2 : 0);
}

export function serializeNdjson(tables: Table[], opts: SerializeOptions): string {
  const eol = opts.eol ?? "\n";
  const lines: string[] = [];
  const multi = tables.length > 1;
  tables.forEach((t, i) => {
    for (const r of plainRows(t.rows, opts)) {
      lines.push(JSON.stringify(multi ? { _table: t.name ?? `${opts.tableName ?? "table"}${i + 1}`, ...r } : r));
    }
  });
  return lines.join(eol);
}
