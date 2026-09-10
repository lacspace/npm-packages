/**
 * A small, dependency-free TOML subset codec (read + write).
 *
 * Supported on read: bare/quoted keys, `key = value`, tables `[a.b]`, arrays of
 * tables `[[a.b]]`, dotted keys (`a.b = 1`), strings (basic `"..."` and literal
 * `'...'`), integers, floats, booleans, arrays (incl. nested / multi-type),
 * inline tables `{ a = 1, b = 2 }`, and `#` comments. Datetimes are kept as
 * strings.
 *
 * NOT supported (documented): multi-line strings (`"""`/`'''`), native date-time
 * typing (they stay strings), underscores in numbers are stripped, and mixed
 * redefinition of a key.
 */
import { ConvertError, safeSet, isForbiddenKey, isPlainObject } from "./util";
import type { JsonValue } from "./util";

type Obj = Record<string, JsonValue>;

function parseValue(raw: string): JsonValue {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s[0] === '"') return parseBasicString(s);
  if (s[0] === "'") return parseLiteralString(s);
  if (s[0] === "[") return parseArray(s);
  if (s[0] === "{") return parseInline(s);
  // number?
  const numStr = s.replace(/_/g, "");
  if (/^[-+]?(0|[1-9]\d*)$/.test(numStr)) return parseInt(numStr, 10);
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(numStr) && /\d/.test(numStr)) {
    const n = Number(numStr);
    if (!Number.isNaN(n)) return n;
  }
  if (/^0x[0-9a-fA-F]+$/.test(numStr)) return parseInt(numStr, 16);
  // datetime or bare — keep as string
  return s;
}

function parseBasicString(s: string): string {
  if (s.length < 2 || s[s.length - 1] !== '"') throw new ConvertError(`TOML: unterminated string ${s}`);
  return s.slice(1, -1).replace(/\\(["\\/nrt]|u[0-9a-fA-F]{4})/g, (_m, c: string) => {
    if (c[0] === "u") return String.fromCharCode(parseInt(c.slice(1), 16));
    return c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c;
  });
}

function parseLiteralString(s: string): string {
  if (s.length < 2 || s[s.length - 1] !== "'") throw new ConvertError(`TOML: unterminated literal string ${s}`);
  return s.slice(1, -1);
}

function splitTop(s: string, open: string, close: string): string[] {
  // split comma-separated items at depth 0, respecting quotes/brackets/braces
  const inner = s.slice(1, -1);
  const items: string[] = [];
  let depth = 0, inD = false, inSq = false, cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inD) { cur += ch; if (ch === '"' && inner[i - 1] !== "\\") inD = false; continue; }
    if (inSq) { cur += ch; if (ch === "'") inSq = false; continue; }
    if (ch === '"') { inD = true; cur += ch; continue; }
    if (ch === "'") { inSq = true; cur += ch; continue; }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") items.push(cur);
  void open; void close;
  return items;
}

function parseArray(s: string): JsonValue[] {
  const items = splitTop(s, "[", "]");
  return items.map((it) => parseValue(it.trim()));
}

function parseInline(s: string): Obj {
  const items = splitTop(s, "{", "}");
  const obj: Obj = {};
  for (const it of items) {
    const t = it.trim();
    if (t === "") continue;
    const eq = findEquals(t);
    const key = t.slice(0, eq).trim();
    const val = parseValue(t.slice(eq + 1).trim());
    assignDotted(obj, splitKeyPath(key), val);
  }
  return obj;
}

function findEquals(line: string): number {
  let inD = false, inSq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inD) { if (ch === '"' && line[i - 1] !== "\\") inD = false; continue; }
    if (inSq) { if (ch === "'") inSq = false; continue; }
    if (ch === '"') { inD = true; continue; }
    if (ch === "'") { inSq = true; continue; }
    if (ch === "=") return i;
  }
  return -1;
}

function splitKeyPath(key: string): string[] {
  const parts: string[] = [];
  let cur = "", inD = false, inSq = false;
  for (let i = 0; i < key.length; i++) {
    const ch = key[i]!;
    if (inD) { if (ch === '"') { inD = false; } else cur += ch; continue; }
    if (inSq) { if (ch === "'") { inSq = false; } else cur += ch; continue; }
    if (ch === '"') { inD = true; continue; }
    if (ch === "'") { inSq = true; continue; }
    if (ch === ".") { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter((p) => p !== "");
}

function assignDotted(root: Obj, path: string[], value: JsonValue): void {
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    if (isForbiddenKey(k)) return;
    if (!isPlainObject(cur[k])) safeSet(cur, k, {});
    cur = cur[k] as Obj;
  }
  const last = path[path.length - 1]!;
  if (!isForbiddenKey(last)) safeSet(cur, last, value);
}

function ensureTable(root: Obj, path: string[]): Obj {
  let cur = root;
  for (const k of path) {
    if (isForbiddenKey(k)) throw new ConvertError(`TOML: forbidden key "${k}"`);
    const existing = cur[k];
    if (Array.isArray(existing)) {
      const arr = existing as JsonValue[];
      cur = arr[arr.length - 1] as Obj;
    } else if (isPlainObject(existing)) {
      cur = existing as Obj;
    } else {
      safeSet(cur, k, {});
      cur = cur[k] as Obj;
    }
  }
  return cur;
}

function ensureArrayTable(root: Obj, path: string[]): Obj {
  const parent = ensureTable(root, path.slice(0, -1));
  const last = path[path.length - 1]!;
  if (isForbiddenKey(last)) throw new ConvertError(`TOML: forbidden key "${last}"`);
  if (!Array.isArray(parent[last])) safeSet(parent, last, []);
  const arr = parent[last] as JsonValue[];
  const tbl: Obj = {};
  arr.push(tbl);
  return tbl;
}

/** Parse a TOML document into a JSON value (object). */
export function parseToml(src: string): JsonValue {
  const root: Obj = {};
  let cur: Obj = root;
  const lines = src.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li]!;
    line = stripComment(line).trim();
    if (line === "") continue;
    if (line.startsWith("[[") && line.endsWith("]]")) {
      const path = splitKeyPath(line.slice(2, -2).trim());
      cur = ensureArrayTable(root, path);
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      const path = splitKeyPath(line.slice(1, -1).trim());
      cur = ensureTable(root, path);
      continue;
    }
    const eq = findEquals(line);
    if (eq < 0) throw new ConvertError(`TOML: expected "key = value" at line ${li + 1}: "${line}"`);
    const key = line.slice(0, eq).trim();
    const value = parseValue(line.slice(eq + 1).trim());
    assignDotted(cur, splitKeyPath(key), value);
  }
  return root;
}

function stripComment(line: string): string {
  let inD = false, inSq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inD) { if (ch === '"' && line[i - 1] !== "\\") inD = false; continue; }
    if (inSq) { if (ch === "'") inSq = false; continue; }
    if (ch === '"') { inD = true; continue; }
    if (ch === "'") { inSq = true; continue; }
    if (ch === "#") return line.slice(0, i);
  }
  return line;
}

// --- writer ---------------------------------------------------------------

function bareKey(k: string): string {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
}

function writeInlineValue(v: JsonValue): string {
  if (v === null) return '""'; // TOML has no null; represent as empty string
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : '"NaN"';
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(writeInlineValue).join(", ") + "]";
  // inline table
  const entries = Object.keys(v).map((k) => `${bareKey(k)} = ${writeInlineValue((v as Obj)[k]!)}`);
  return "{ " + entries.join(", ") + " }";
}

function isTableArray(v: JsonValue): boolean {
  return Array.isArray(v) && v.length > 0 && v.every((x) => isPlainObject(x));
}

function writeToml(obj: Obj, prefix: string[], out: string[]): void {
  const scalars: string[] = [];
  const tables: Array<[string, Obj]> = [];
  const tableArrays: Array<[string, Obj[]]> = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k]!;
    if (isPlainObject(v)) tables.push([k, v as Obj]);
    else if (isTableArray(v)) tableArrays.push([k, v as Obj[]]);
    else scalars.push(`${bareKey(k)} = ${writeInlineValue(v)}`);
  }
  if (scalars.length) out.push(scalars.join("\n"));
  for (const [k, v] of tables) {
    const path = [...prefix, k];
    out.push(`\n[${path.map(bareKey).join(".")}]`);
    writeToml(v, path, out);
  }
  for (const [k, arr] of tableArrays) {
    const path = [...prefix, k];
    for (const item of arr) {
      out.push(`\n[[${path.map(bareKey).join(".")}]]`);
      writeToml(item, path, out);
    }
  }
}

/** Serialize a JSON object to TOML. Throws if the top level is not an object. */
export function stringifyToml(value: JsonValue): string {
  if (!isPlainObject(value)) {
    throw new ConvertError("TOML output requires a top-level object/table");
  }
  const out: string[] = [];
  writeToml(value as Obj, [], out);
  return out.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n") + "\n";
}
