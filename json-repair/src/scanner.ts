/**
 * String-aware extraction of a JSON payload from arbitrary text.
 *
 * Handles the three ways an LLM tends to wrap JSON:
 *   1. A fenced code block — ```json … ``` (or a bare ``` … ```).
 *   2. Prose before/after the JSON — "Sure! Here is the data: { … }. Hope it helps!".
 *   3. Nothing at all — the text is already just JSON.
 *
 * The scanner is string-aware: braces and brackets that live inside a string
 * value (single- or double-quoted) never move the depth counter, and escapes
 * are respected, so `{"msg":"a } b"}` is extracted as one whole object.
 */

/**
 * Locate the JSON payload inside arbitrary text and return it as a substring.
 *
 * - Strips a ```json … ``` (or bare ```) fence if one is present.
 * - Skips leading and trailing prose.
 * - Returns the first balanced `{…}` or `[…]`. If the structure is truncated
 *   (no matching close, e.g. streaming output), returns from the opening bracket
 *   to the end of the input so {@link repairJson}/{@link parsePartial} can finish it.
 *
 * The returned string is *not* repaired — it can still contain trailing commas,
 * single quotes, etc. Run it through {@link repairJson} to get valid JSON.
 *
 * @returns the JSON substring, or `undefined` if no `{` or `[` is found.
 */
export function extractJson(text: string): string | undefined {
  if (typeof text !== "string" || text.length === 0) return undefined;
  const body = stripFence(text);
  return findBalanced(body);
}

/**
 * If the text contains a fenced code block, return its inner content; otherwise
 * return the text unchanged. Tolerates a missing closing fence (truncated output).
 */
function stripFence(text: string): string {
  // Opening fence: ``` optionally followed by a language tag (json, json5, jsonc…),
  // then optional trailing spaces and a line break.
  const open = /```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n/.exec(text);
  if (!open) return text;
  const after = text.slice(open.index + open[0].length);
  const close = after.indexOf("```");
  return close === -1 ? after : after.slice(0, close);
}

/**
 * Scan for the first `{` or `[` and walk forward, string- and escape-aware,
 * until the matching close. Returns the balanced substring, or — when the input
 * ends before the structure closes — the tail from the opening bracket onward.
 */
function findBalanced(s: string): string | undefined {
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "[") {
      start = i;
      break;
    }
  }
  if (start === -1) return undefined;

  let depth = 0;
  let inStr = false;
  let quote = "";
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
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
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  // Truncated: never closed. Hand back everything from the opener.
  return s.slice(start);
}
