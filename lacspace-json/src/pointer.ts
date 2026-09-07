/**
 * RFC 6901 JSON Pointer — a string syntax for identifying a single value inside a
 * JSON document (`/a/b/0`). Pure, zero-dependency, browser-safe.
 *
 * ```ts
 * pointer({ a: { b: [10, 20] } }, "/a/b/1"); // 20
 * pointer({ a: 1 }, "");                       // { a: 1 }  (empty pointer = whole doc)
 * ```
 *
 * Token unescaping follows the RFC: `~1` → `/` and `~0` → `~` (in that order).
 */
import { JsonToolError, isPlainObject } from "./util.js";
import type { JsonValue } from "./util.js";

/** Unescape a single reference token (`~1` → `/`, `~0` → `~`). */
export function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Escape a raw key into a reference token (`~` → `~0`, `/` → `~1`). */
export function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Split a JSON Pointer string into its (unescaped) reference tokens. The empty
 * pointer `""` yields `[]`. A non-empty pointer must start with `/`.
 */
export function parsePointer(ptr: string): string[] {
  if (ptr === "") return [];
  if (ptr[0] !== "/") throw new JsonToolError(`Invalid JSON Pointer "${ptr}" (must be empty or start with "/")`);
  return ptr.slice(1).split("/").map(unescapePointerToken);
}

/** Build a JSON Pointer string from a list of raw (unescaped) tokens. */
export function buildPointer(tokens: Array<string | number>): string {
  if (tokens.length === 0) return "";
  return "/" + tokens.map((t) => escapePointerToken(String(t))).join("/");
}

/**
 * Resolve a JSON Pointer against `doc`, returning the referenced value. Throws a
 * {@link JsonToolError} when any token does not resolve (RFC 6901 error semantics).
 * Use {@link hasPointer} for a non-throwing existence check.
 */
export function pointer(doc: JsonValue, ptr: string): JsonValue {
  const tokens = parsePointer(ptr);
  let cur: JsonValue = doc;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (Array.isArray(cur)) {
      const idx = token === "-" ? cur.length : /^\d+$/.test(token) ? Number(token) : NaN;
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        throw new JsonToolError(`JSON Pointer "${ptr}" has no value at token "${token}"`);
      }
      cur = cur[idx]!;
    } else if (isPlainObject(cur)) {
      if (!Object.prototype.hasOwnProperty.call(cur, token)) {
        throw new JsonToolError(`JSON Pointer "${ptr}" has no value at token "${token}"`);
      }
      cur = (cur as Record<string, JsonValue>)[token]!;
    } else {
      throw new JsonToolError(`JSON Pointer "${ptr}" descends into a ${cur === null ? "null" : typeof cur} at token "${token}"`);
    }
  }
  return cur;
}

/** True if the pointer resolves to a value in `doc` (never throws). */
export function hasPointer(doc: JsonValue, ptr: string): boolean {
  try {
    pointer(doc, ptr);
    return true;
  } catch {
    return false;
  }
}
