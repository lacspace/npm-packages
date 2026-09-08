/**
 * Extract **every** JSON value embedded in arbitrary text — not just the first.
 *
 * Where {@link extractJson} returns the single first balanced structure,
 * {@link extractAllJson} keeps walking and returns each balanced `{…}`/`[…]` it
 * finds, in order. This is the shape you want when a model emits several JSON
 * objects (one per fenced block, one per line, or scattered through prose), e.g.
 * a batch of tool calls or a list of records.
 *
 * The scan is string-aware in exactly the way {@link extractJson} is: braces and
 * brackets inside a string value (single-, double- or back-quoted) never move the
 * depth counter, and escapes are respected.
 */

import { parseJson, type ParseJsonOptions } from "./parse.js";

/**
 * Find and return every balanced JSON value ({@code {…}} or {@code […]}) in the
 * text, in the order they appear. Prose, code fences and text between the values
 * are skipped. If the final structure is truncated (streaming / cut off), its
 * tail — from the opening bracket to end-of-input — is included as the last item
 * so it can still be finished by {@link repairJson} / {@link parsePartial}.
 *
 * ```ts
 * extractAllJson('a {"id":1} then {"id":2} end');
 * // → ['{"id":1}', '{"id":2}']
 * ```
 *
 * @returns an array of JSON substrings (empty if none are found). The substrings
 *   are **not** repaired — run each through {@link repairJson} for valid JSON, or
 *   use {@link parseAllJson} to get parsed values directly.
 */
export function extractAllJson(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const out: string[] = [];
  let from = 0;
  const len = text.length;

  while (from < len) {
    // Locate the next opening bracket.
    let start = -1;
    for (let i = from; i < len; i++) {
      const c = text[i];
      if (c === "{" || c === "[") {
        start = i;
        break;
      }
    }
    if (start === -1) break;

    let depth = 0;
    let inStr = false;
    let quote = "";
    let escaped = false;
    let end = -1;

    for (let i = start; i < len; i++) {
      const c = text[i];
      if (inStr) {
        if (escaped) {
          escaped = false;
        } else if (c === "\\") {
          escaped = true;
        } else if (c === quote) {
          inStr = false;
        }
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inStr = true;
        quote = c;
        continue;
      }
      if (c === "{" || c === "[") {
        depth++;
      } else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      // Truncated: never closed. Hand back the tail and stop.
      out.push(text.slice(start));
      break;
    }
    out.push(text.slice(start, end + 1));
    from = end + 1;
  }

  return out;
}

/**
 * Extract every JSON value in the text and repair + parse each one, returning the
 * successfully parsed values. Individual values that cannot be parsed are skipped
 * (they never abort the batch), unless a `fallback` is supplied in `opts`, in
 * which case the fallback is used in their place so the result length matches the
 * number of values found.
 *
 * ```ts
 * parseAllJson('```json\n{ ok: true, }\n```\nand [1, 2, 3,]');
 * // → [{ ok: true }, [1, 2, 3]]
 * ```
 *
 * @param opts same options as {@link parseJson}; `extract` is forced off per item
 *   (each item is already an extracted value). Defaults to repairing each item.
 */
export function parseAllJson<T = unknown>(
  text: string,
  opts: ParseJsonOptions<T> = {},
): T[] {
  const pieces = extractAllJson(text);
  const hasFallback = "fallback" in opts;
  const perItem: ParseJsonOptions<T> = { ...opts, extract: false };
  const out: T[] = [];
  for (const piece of pieces) {
    if (hasFallback) {
      out.push(parseJson<T>(piece, perItem));
      continue;
    }
    try {
      out.push(parseJson<T>(piece, perItem));
    } catch {
      /* skip unparseable pieces when no fallback is given */
    }
  }
  return out;
}
