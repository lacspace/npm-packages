/**
 * Structured-output parsing helpers.
 *
 * LLMs asked for JSON often wrap it in prose or a ```json code fence. These pure
 * helpers pull the first complete, balanced JSON value out of such a reply and
 * parse it — returning `undefined` (never throwing) when nothing valid is found.
 *
 * ```ts
 * const res = await chat(opts);
 * const data = parseJson<{ city: string }>(res.text);
 * ```
 */

/** Strip a Markdown ```json … ``` fence, returning the inner body if present. */
function stripFence(text: string): string {
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return fence ? fence[1]! : text;
}

function tryParse(s: string): unknown {
  const t = s.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/**
 * Return the first balanced `{…}` or `[…]` region in `s` (string-aware, so
 * braces inside string literals don't confuse it), or `undefined`.
 */
function firstBalanced(s: string): string | undefined {
  for (let i = 0; i < s.length; i++) {
    const open = s[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return s.slice(i, j + 1);
      }
    }
  }
  return undefined;
}

/**
 * Extract and parse the first complete JSON value embedded in an arbitrary
 * string (an LLM reply, possibly fenced or surrounded by prose). Returns the
 * parsed value, or `undefined` if nothing parses. Never throws.
 */
export function extractJson(text: string): unknown {
  if (typeof text !== "string") return undefined;
  // 1) Try the fenced/trimmed body as-is.
  const direct = tryParse(stripFence(text));
  if (direct !== undefined) return direct;
  // 2) Otherwise scan for the first balanced object/array region.
  const region = firstBalanced(text);
  return region !== undefined ? tryParse(region) : undefined;
}

/**
 * Typed convenience over {@link extractJson}. You assert the shape `T`; parsing
 * is best-effort and unvalidated — it returns `undefined` when no JSON is found.
 */
export function parseJson<T = unknown>(text: string): T | undefined {
  return extractJson(text) as T | undefined;
}
