/**
 * Field transforms — small, pure post-processors you can pipe onto any extracted
 * value. They let a selector schema clean and coerce data inline (e.g. turn
 * `"$9.99"` into the number `9.99`, resolve a relative link, or pull a date out
 * of a string) instead of post-processing every record by hand.
 *
 * A pipe is written left-to-right with `|`, e.g. `.price | number` or
 * `.date | date | trim`. In the library, a {@link FieldSpec} carries the pipe as
 * `transform: string | string[]`.
 *
 * Supported transforms:
 * `trim, lower, upper, number, int, float, date, replace:a:b, regex:<pat>[:group],
 *  split:<sep>, slice:a:b, absolute, prepend:<s>, append:<s>, default:<s>`.
 */
import type { FieldSpec } from "./types.js";

/** Context passed to URL-resolving transforms (`absolute`). */
export interface TransformCtx {
  /** Base URL used to resolve relative links for `absolute`. */
  base?: string;
}

/**
 * Split a string on top-level `|`, ignoring `|` inside `[...]` attribute
 * selectors, `(...)` (e.g. a regex alternation) and quotes. Used to separate a
 * selector head from its transform pipes.
 */
export function splitPipes(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  let bracket = 0;
  let paren = 0;
  let quote = "";
  for (const ch of s) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    if (ch === "|" && bracket === 0 && paren === 0) { out.push(buf); buf = ""; }
    else buf += ch;
  }
  out.push(buf);
  return out;
}

/**
 * Parse a CLI/string field spec into a {@link FieldSpec}. The head is a CSS
 * selector that may end with `@attr` (read an attribute) and/or `[]` (collect
 * every match); any `| transform` segments become the field's transform pipe.
 *
 * Examples:
 * - `"h1"` → `{ selector: "h1" }`
 * - `"a@href[]"` → `{ selector: "a", attr: "href", all: true }`
 * - `".price | number"` → `{ selector: ".price", transform: "number" }`
 * - `".date | date | trim"` → `{ selector: ".date", transform: ["date", "trim"] }`
 */
export function parseFieldSpec(spec: string): FieldSpec {
  const parts = splitPipes(spec);
  let head = (parts.shift() ?? "").trim();
  const all = head.endsWith("[]");
  if (all) head = head.slice(0, -2).trim();
  const at = head.indexOf("@");
  const selector = at >= 0 ? head.slice(0, at).trim() : head;
  const attr = at >= 0 ? head.slice(at + 1).trim() : undefined;
  const transforms = parts.map((p) => p.trim()).filter(Boolean);

  const out: FieldSpec = { selector };
  if (attr) out.attr = attr;
  if (all) out.all = true;
  if (transforms.length) out.transform = transforms.length === 1 ? transforms[0]! : transforms;
  return out;
}

function splitFirst(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
}

/** Pull the first number out of a string ("$1,299.50" → 1299.5). `null` if none. */
function toNumber(s: string): number | null {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function tokensOf(pipe: string | string[]): string[] {
  const raw = Array.isArray(pipe) ? pipe.flatMap((p) => splitPipes(p)) : splitPipes(pipe);
  return raw.map((t) => t.trim()).filter(Boolean);
}

/** Apply ONE transform token to a scalar value. */
function applyOne(value: unknown, token: string, ctx: TransformCtx): unknown {
  const [name, rest] = splitFirst(token, ":");
  const s = value === null || value === undefined ? "" : String(value);
  switch (name) {
    case "trim": return s.replace(/\s+/g, " ").trim();
    case "lower": return s.toLowerCase();
    case "upper": return s.toUpperCase();
    case "number":
    case "float": return toNumber(s);
    case "int": { const n = toNumber(s); return n === null ? null : Math.trunc(n); }
    case "date": { const d = new Date(s); return Number.isNaN(d.getTime()) ? value : d.toISOString(); }
    case "replace": {
      const [a, b] = (rest ?? "").split(":");
      return a === undefined ? s : s.split(a).join(b ?? "");
    }
    case "regex": {
      let pattern = rest ?? "";
      let group = 0;
      const g = /:(\d+)$/.exec(pattern);
      if (g) { group = parseInt(g[1]!, 10); pattern = pattern.slice(0, g.index); }
      try {
        const m = new RegExp(pattern).exec(s);
        return m ? (m[group] ?? "") : "";
      } catch { return value; }
    }
    case "split": return s.split(rest ?? "");
    case "slice": {
      const [a, b] = (rest ?? "").split(":");
      const start = a && a.length ? parseInt(a, 10) : 0;
      const end = b !== undefined && b.length ? parseInt(b, 10) : undefined;
      return s.slice(Number.isNaN(start) ? 0 : start, end === undefined || Number.isNaN(end) ? undefined : end);
    }
    case "absolute": {
      if (!s) return value;
      try { return new URL(s, ctx.base).href; } catch { return value; }
    }
    case "prepend": return (rest ?? "") + s;
    case "append": return s + (rest ?? "");
    case "default": return s === "" ? (rest ?? "") : value;
    default: return value; // unknown transform → passthrough (forward-compatible)
  }
}

/**
 * Apply a transform pipe to a value. Arrays (from `all: true`) are transformed
 * element-wise. Unknown transforms pass the value through unchanged.
 *
 * @param value the extracted value (string, array of strings, or anything).
 * @param pipe  a pipe string (`"number"`, `"date | trim"`) or an array of tokens.
 * @param ctx   optional context (`base` for the `absolute` URL resolver).
 */
export function applyTransform(value: unknown, pipe: string | string[], ctx: TransformCtx = {}): unknown {
  const tokens = tokensOf(pipe);
  if (!tokens.length) return value;
  return tokens.reduce<unknown>((v, token) => {
    if (Array.isArray(v)) return v.map((el) => applyOne(el, token, ctx));
    return applyOne(v, token, ctx);
  }, value);
}
