/**
 * Formatting helpers: pretty-print, minify, sort-keys, and a single-value path
 * getter (`--get`).
 */
import { sortKeysDeep, JsonToolError } from "./util.js";
import type { JsonValue } from "./util.js";

export interface FormatOptions {
  indent?: number;
  sortKeys?: boolean;
  minify?: boolean;
}

/** Pretty-print (or minify) a JSON value. */
export function formatJson(value: JsonValue, opts: FormatOptions = {}): string {
  const v = opts.sortKeys ? (sortKeysDeep(value) as JsonValue) : value;
  if (opts.minify) return JSON.stringify(v);
  const indent = opts.indent ?? 2;
  return JSON.stringify(v, null, indent);
}

/**
 * Resolve a dotted / bracketed path (`.a.b[0].c`, `a.b`, `users[2].name`) to a
 * single value. Returns `undefined` if any segment is missing.
 */
export function getPath(data: JsonValue, path: string): JsonValue | undefined {
  const segments = parsePath(path);
  let cur: unknown = data;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) return undefined;
      const idx = seg < 0 ? cur.length + seg : seg;
      cur = cur[idx];
    } else {
      if (Array.isArray(cur) || typeof cur !== "object") return undefined;
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return cur as JsonValue | undefined;
}

/** Tokenize a path string into key/index segments. */
export function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  let i = 0;
  const n = path.length;
  if (path[0] === ".") i = 1;
  let cur = "";
  const flush = (): void => { if (cur !== "") { out.push(cur); cur = ""; } };
  while (i < n) {
    const ch = path[i]!;
    if (ch === ".") { flush(); i++; continue; }
    if (ch === "[") {
      flush();
      const close = path.indexOf("]", i);
      if (close < 0) throw new JsonToolError(`Unbalanced [ in path "${path}"`);
      const inner = path.slice(i + 1, close).trim();
      if ((inner[0] === '"' && inner.endsWith('"')) || (inner[0] === "'" && inner.endsWith("'"))) {
        out.push(inner.slice(1, -1));
      } else if (/^-?\d+$/.test(inner)) {
        out.push(parseInt(inner, 10));
      } else {
        out.push(inner);
      }
      i = close + 1;
      continue;
    }
    cur += ch;
    i++;
  }
  flush();
  return out;
}
