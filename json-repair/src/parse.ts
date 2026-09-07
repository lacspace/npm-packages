/**
 * The high-level API: turn arbitrary LLM text into parsed data.
 *
 * `parseJson` chains extract → repair → JSON.parse; `safeParseJson` is its
 * never-throwing sibling; `parsePartial` is a best-effort reader for
 * incomplete / streaming JSON.
 */

import { extractJson } from "./scanner.js";
import { lenientParse, repairJson } from "./repair.js";

/** Thrown by {@link parseJson} when the text cannot be parsed and no fallback is given. */
export class JsonRepairError extends Error {
  /** A short snippet of the payload that failed to parse. */
  readonly snippet: string;
  /** The underlying error thrown by `JSON.parse`, if any. */
  readonly cause?: unknown;

  constructor(message: string, snippet: string, cause?: unknown) {
    super(snippet ? `${message} — near: ${snippet}` : message);
    this.name = "JsonRepairError";
    this.snippet = snippet;
    this.cause = cause;
  }
}

/** Options for {@link parseJson}. */
export interface ParseJsonOptions<T = unknown> {
  /** Repair common breakage before parsing. Default `true`. */
  repair?: boolean;
  /** Locate the JSON inside surrounding prose / code fences first. Default `true`. */
  extract?: boolean;
  /** If provided, returned instead of throwing when parsing fails. */
  fallback?: T;
}

/** Result of {@link safeParseJson}. */
export type SafeParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

function snippetOf(text: string): string {
  const trimmed = text.trim();
  const cut = trimmed.slice(0, 120);
  return cut.length < trimmed.length ? `${cut}…` : cut;
}

/**
 * Extract (optional) + repair (optional) + `JSON.parse` a chunk of text.
 *
 * ```ts
 * parseJson('Sure! ```json\n{ "ok": true, }\n```'); // → { ok: true }
 * parseJson("not json", { fallback: {} });          // → {}
 * ```
 *
 * @throws {JsonRepairError} on failure when no `fallback` is provided.
 */
export function parseJson<T = unknown>(text: string, opts: ParseJsonOptions<T> = {}): T {
  const { repair = true, extract = true } = opts;
  const hasFallback = "fallback" in opts;

  let payload = typeof text === "string" ? text : String(text);
  try {
    if (extract) {
      const found = extractJson(payload);
      if (found !== undefined) payload = found;
    }
    if (repair) {
      payload = repairJson(payload);
    }
    return JSON.parse(payload) as T;
  } catch (err) {
    if (hasFallback) return opts.fallback as T;
    throw new JsonRepairError("Could not parse JSON", snippetOf(payload), err);
  }
}

/**
 * Like {@link parseJson} but never throws: returns `{ ok, value }` on success or
 * `{ ok: false, error }` on failure. Any `fallback` in `opts` is ignored — use
 * the result shape instead.
 */
export function safeParseJson<T = unknown>(
  text: string,
  opts: Omit<ParseJsonOptions<T>, "fallback"> = {},
): SafeParseResult<T> {
  try {
    const value = parseJson<T>(text, opts as ParseJsonOptions<T>);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

/**
 * Best-effort parse of **incomplete / streaming** JSON: extracts the payload and
 * closes whatever is still open, so a half-arrived object still yields the
 * fields received so far. Ideal for rendering a streaming LLM response live.
 *
 * ```ts
 * parsePartial('{"title":"Hello","body":"wor'); // → { title: "Hello", body: "wor" }
 * ```
 *
 * @returns the parsed value, or `undefined` if nothing usable was found.
 */
export function parsePartial<T = unknown>(text: string): T | undefined {
  if (typeof text !== "string" || text.trim() === "") return undefined;
  let payload = text;
  const found = extractJson(text);
  if (found !== undefined) payload = found;
  try {
    return lenientParse(payload) as T;
  } catch {
    return undefined;
  }
}
