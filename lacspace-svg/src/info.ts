/**
 * Inspect an SVG: dimensions, viewBox, element counts, byte size and safety
 * warnings (embedded `<script>` and inline `on*` event handlers). Purely
 * descriptive — it never executes anything it finds.
 */

import type { SvgRoot } from "./parse.js";
import { parseSvg, walk, findRootSvg, getAttr } from "./parse.js";

/** A potential safety concern found while inspecting an SVG. */
export interface SvgWarning {
  kind: "script" | "event-handler" | "external-href" | "foreign-object";
  detail: string;
}

/** Result of {@link info}. */
export interface SvgInfo {
  bytes: number;
  width?: string;
  height?: string;
  viewBox?: string;
  /** Numeric [minX, minY, width, height] when a viewBox is present. */
  viewBoxValues?: number[];
  /** Element name → count. */
  elements: Record<string, number>;
  elementCount: number;
  idCount: number;
  hasScript: boolean;
  warnings: SvgWarning[];
}

const EXTERNAL_RE = /^(https?:)?\/\//i;

/** Inspect an SVG string and return descriptive stats + safety warnings. */
export function info(input: string): SvgInfo {
  const root: SvgRoot = parseSvg(input);
  const svg = findRootSvg(root);
  const elements: Record<string, number> = {};
  const warnings: SvgWarning[] = [];
  let elementCount = 0;
  let idCount = 0;
  let hasScript = false;

  walk(root, (el) => {
    elementCount++;
    elements[el.name] = (elements[el.name] ?? 0) + 1;
    if (getAttr(el, "id") !== undefined) idCount++;
    if (el.name === "script") {
      hasScript = true;
      warnings.push({ kind: "script", detail: "<script> element present" });
    }
    if (el.name === "foreignObject") {
      warnings.push({ kind: "foreign-object", detail: "<foreignObject> can embed arbitrary HTML" });
    }
    for (const a of el.attributes) {
      if (/^on[a-z]+/i.test(a.name)) {
        warnings.push({ kind: "event-handler", detail: `${el.name}[${a.name}]` });
      }
      if ((a.name === "href" || a.name === "xlink:href") && EXTERNAL_RE.test(a.value.trim())) {
        warnings.push({ kind: "external-href", detail: `${el.name} → ${a.value.trim()}` });
      }
    }
  });

  const out: SvgInfo = {
    bytes: Buffer.byteLength(input, "utf8"),
    elements,
    elementCount,
    idCount,
    hasScript,
    warnings,
  };
  if (svg) {
    const w = getAttr(svg, "width");
    const h = getAttr(svg, "height");
    const vb = getAttr(svg, "viewBox");
    if (w !== undefined) out.width = w;
    if (h !== undefined) out.height = h;
    if (vb !== undefined) {
      out.viewBox = vb;
      const nums = vb.trim().split(/[\s,]+/).map(Number);
      if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) out.viewBoxValues = nums;
    }
  }
  return out;
}
