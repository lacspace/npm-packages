/**
 * Replace hard-coded `fill`/`stroke`/`stop-color` values with `currentColor`
 * so an SVG icon inherits the surrounding CSS `color`. Colours that must stay
 * literal (`none`, `transparent`, gradient/pattern `url(#…)` references, and a
 * caller-supplied keep-list) are left untouched.
 *
 * Zero-dependency: it reuses the tiny SVG parser/serializer underneath.
 */

import type { SvgElement } from "./parse.js";
import { parseSvg, serialize, walk } from "./parse.js";

/** Options for {@link currentColorize} / the optimizer's `currentColor` pass. */
export interface CurrentColorOptions {
  /** Colours to leave literal (matched case-insensitively, trimmed). */
  keep?: string[];
  /** Which presentation attributes to convert. Default `["fill","stroke","stop-color"]`. */
  attrs?: string[];
  /** Also rewrite matching declarations inside a `style="…"` string. Default `true`. */
  style?: boolean;
}

/** Result of {@link currentColorize}: the rewritten SVG + how many colours changed. */
export interface CurrentColorResult {
  data: string;
  /** Number of colour tokens replaced with `currentColor`. */
  replaced: number;
}

const DEFAULT_ATTRS = ["fill", "stroke", "stop-color"];
/** Values that are never a literal colour and must be preserved verbatim. */
const SKIP = new Set([
  "none", "transparent", "inherit", "currentcolor", "context-fill", "context-stroke",
]);

function shouldReplace(value: string, keep: Set<string>): boolean {
  const t = value.trim().toLowerCase();
  if (!t) return false;
  if (SKIP.has(t)) return false;
  if (t.startsWith("url(")) return false;
  if (keep.has(t)) return false;
  return true;
}

/**
 * Rewrite one element's colour attributes in place. Returns the number of
 * replacements made. Exposed so the optimizer can run it inside its own walk.
 */
export function currentColorizeElement(el: SvgElement, opts: CurrentColorOptions = {}): number {
  const attrs = opts.attrs ?? DEFAULT_ATTRS;
  const keep = new Set((opts.keep ?? []).map((s) => s.trim().toLowerCase()));
  const doStyle = opts.style !== false;
  let count = 0;
  for (const a of el.attributes) {
    if (attrs.includes(a.name)) {
      if (shouldReplace(a.value, keep)) {
        a.value = "currentColor";
        count++;
      }
    } else if (doStyle && a.name === "style") {
      a.value = a.value.replace(
        /(fill|stroke|stop-color)\s*:\s*([^;]+)/gi,
        (all, prop: string, val: string) => {
          if (!attrs.includes(prop.toLowerCase())) return all;
          if (!shouldReplace(val, keep)) return all;
          count++;
          return `${prop}:currentColor`;
        },
      );
    }
  }
  return count;
}

/** Rewrite every literal colour in an SVG string to `currentColor`. */
export function currentColorize(input: string, opts: CurrentColorOptions = {}): CurrentColorResult {
  const root = parseSvg(input);
  let replaced = 0;
  walk(root, (el) => {
    replaced += currentColorizeElement(el, opts);
  });
  return { data: serialize(root, { pretty: false }), replaced };
}
