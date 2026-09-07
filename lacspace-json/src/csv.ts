/**
 * CSV and NDJSON codecs (dependency-free, RFC-4180-ish).
 *
 * CSV read: a header row becomes object keys; each following row becomes an
 * object. Quoted fields, embedded commas, quotes (`""`) and newlines are
 * handled. Values are kept as strings unless they look like a number / boolean /
 * null (toggle with `parseTypes: false`).
 *
 * CSV write: an array of flat objects → header + rows. The union of all keys
 * (in first-seen order) forms the header. Nested values are JSON-encoded.
 */
import { JsonToolError, safeSet, isForbiddenKey, isPlainObject } from "./util.js";
import type { JsonValue } from "./util.js";

export interface CsvParseOptions {
  delimiter?: string;
  parseTypes?: boolean;
}

function coerce(raw: string): JsonValue {
  if (raw === "") return "";
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^[-+]?(0|[1-9]\d*)$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (String(n) === raw.replace(/^\+/, "")) return n;
  }
  if (/^[-+]?(\d+\.\d+|\.\d+|\d+)([eE][-+]?\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return raw;
}

/** Parse CSV text into an array of objects (or arrays if no header wanted). */
export function parseCsv(src: string, opts: CsvParseOptions = {}): JsonValue {
  const delim = opts.delimiter ?? ",";
  const parseTypes = opts.parseTypes ?? true;
  const rows = parseCsvRows(src, delim);
  if (rows.length === 0) return [];
  const header = rows[0]!;
  const out: JsonValue[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.length === 1 && row[0] === "") continue; // blank line
    const obj: Record<string, JsonValue> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] ?? `col${c}`;
      if (isForbiddenKey(key)) continue;
      const cell = row[c] ?? "";
      safeSet(obj, key, parseTypes ? coerce(cell) : cell);
    }
    out.push(obj);
  }
  return out;
}

function parseCsvRows(src: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = src.length;
  // strip a UTF-8 BOM
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function needsQuote(s: string, delim: string): boolean {
  return s.includes(delim) || s.includes('"') || s.includes("\n") || s.includes("\r");
}

function cell(v: JsonValue, delim: string): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (needsQuote(s, delim)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export interface CsvStringifyOptions {
  delimiter?: string;
  columns?: string[];
}

/** Serialize an array of flat objects to CSV. */
export function stringifyCsv(value: JsonValue, opts: CsvStringifyOptions = {}): string {
  const delim = opts.delimiter ?? ",";
  if (!Array.isArray(value)) {
    throw new JsonToolError("CSV output requires an array of objects");
  }
  const rows = value as JsonValue[];
  let columns = opts.columns;
  if (!columns) {
    const seen: string[] = [];
    const set = new Set<string>();
    for (const r of rows) {
      if (isPlainObject(r)) {
        for (const k of Object.keys(r)) if (!set.has(k)) { set.add(k); seen.push(k); }
      }
    }
    columns = seen;
  }
  const lines: string[] = [];
  lines.push(columns.map((c) => cell(c, delim)).join(delim));
  for (const r of rows) {
    if (isPlainObject(r)) {
      lines.push(columns.map((c) => cell((r as Record<string, JsonValue>)[c] ?? null, delim)).join(delim));
    } else {
      lines.push(cell(r, delim));
    }
  }
  return lines.join("\n") + "\n";
}

/** Parse NDJSON (one JSON value per line) into an array. */
export function parseNdjson(src: string): JsonValue {
  const out: JsonValue[] = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    try {
      out.push(JSON.parse(line) as JsonValue);
    } catch (err) {
      throw new JsonToolError(`NDJSON: invalid JSON on line ${i + 1}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Serialize an array to NDJSON (one compact JSON value per line). */
export function stringifyNdjson(value: JsonValue): string {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => JSON.stringify(v)).join("\n") + "\n";
}
