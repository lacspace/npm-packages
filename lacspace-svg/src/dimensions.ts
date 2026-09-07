/**
 * Read and repair an SVG's sizing: report `width`/`height`/`viewBox`, derive a
 * missing `viewBox` from `width`/`height`, and (optionally) derive missing
 * `width`/`height` back from the `viewBox`. Zero-dependency.
 */

import { parseSvg, serialize, findRootSvg, getAttr, setAttr } from "./parse.js";

/** The sizing attributes read off the root `<svg>`. */
export interface Dimensions {
  width?: string;
  height?: string;
  viewBox?: string;
  /** Numeric `[minX, minY, width, height]` when a valid 4-number viewBox exists. */
  viewBoxValues?: number[];
}

/** Matches a plain length like `24` or `24px` (no percentages / calc). */
const LENGTH_RE = /^(\d*\.?\d+)(px)?$/i;

function toLength(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = LENGTH_RE.exec(v.trim());
  if (!m) return undefined;
  const n = parseFloat(m[1]!);
  return Number.isFinite(n) ? n : undefined;
}

function parseViewBox(vb: string | undefined): number[] | undefined {
  if (vb === undefined) return undefined;
  const nums = vb.trim().split(/[\s,]+/).map(Number);
  return nums.length === 4 && nums.every((n) => Number.isFinite(n)) ? nums : undefined;
}

/** Read the sizing attributes from an SVG string's root `<svg>` element. */
export function dimensions(input: string): Dimensions {
  const svg = findRootSvg(parseSvg(input));
  const out: Dimensions = {};
  if (!svg) return out;
  const w = getAttr(svg, "width");
  const h = getAttr(svg, "height");
  const vb = getAttr(svg, "viewBox");
  if (w !== undefined) out.width = w;
  if (h !== undefined) out.height = h;
  if (vb !== undefined) {
    out.viewBox = vb;
    const nums = parseViewBox(vb);
    if (nums) out.viewBoxValues = nums;
  }
  return out;
}

/** Options for {@link fixDimensions}. */
export interface FixDimensionsOptions {
  /** Derive a missing `viewBox` from numeric `width`/`height`. Default `true`. */
  addViewBox?: boolean;
  /** Derive missing `width`/`height` from the `viewBox`. Default `true`. */
  addDimensions?: boolean;
  /** Pretty-print the output instead of minifying. Default `false`. */
  pretty?: boolean;
}

/** Result of {@link fixDimensions}. */
export interface FixDimensionsResult extends Dimensions {
  data: string;
  /** True when a `width`/`height`/`viewBox` attribute was added. */
  changed: boolean;
}

/** Add whichever of `viewBox` / `width` / `height` can be derived from the rest. */
export function fixDimensions(input: string, opts: FixDimensionsOptions = {}): FixDimensionsResult {
  const addViewBox = opts.addViewBox !== false;
  const addDims = opts.addDimensions !== false;
  const root = parseSvg(input);
  const svg = findRootSvg(root);
  let changed = false;
  if (svg) {
    let w = getAttr(svg, "width");
    let h = getAttr(svg, "height");
    let vb = getAttr(svg, "viewBox");

    if (addViewBox && vb === undefined) {
      const wn = toLength(w);
      const hn = toLength(h);
      if (wn !== undefined && hn !== undefined) {
        vb = `0 0 ${wn} ${hn}`;
        setAttr(svg, "viewBox", vb);
        changed = true;
      }
    }
    if (addDims && (w === undefined || h === undefined)) {
      const nums = parseViewBox(vb);
      if (nums) {
        if (w === undefined) {
          w = String(nums[2]);
          setAttr(svg, "width", w);
          changed = true;
        }
        if (h === undefined) {
          h = String(nums[3]);
          setAttr(svg, "height", h);
          changed = true;
        }
      }
    }
  }
  const data = serialize(root, { pretty: opts.pretty ?? false });
  return { data, changed, ...dimensions(data) };
}
