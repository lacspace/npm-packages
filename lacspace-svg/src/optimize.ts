/**
 * An svgo-lite optimizer: a pipeline of safe, well-known SVG optimizations,
 * each individually toggleable. Every default-on transform is lossless to
 * rendering for real-world SVG; the ones that can change output (removing
 * `width`/`height`, dropping `<title>`/`<desc>`) are opt-in.
 *
 * OUT OF SCOPE (deliberately): path-data geometry arithmetic — merging or
 * re-encoding path commands. That is error-prone and easy to get subtly wrong,
 * so we only normalize whitespace and numeric precision inside `d`.
 */

import type { SvgElement, SvgNode, SvgRoot } from "./parse.js";
import { parseSvg, serialize, walk, findRootSvg, removeAttr, getAttr, setAttr } from "./parse.js";
import type { CurrentColorOptions } from "./currentcolor.js";
import { currentColorizeElement } from "./currentcolor.js";

/** Toggle set for {@link optimize}. All booleans default to `true` unless noted. */
export interface OptimizeOptions {
  removeComments?: boolean;
  removeXmlDeclaration?: boolean;
  removeDoctype?: boolean;
  removeMetadata?: boolean;
  /** Strip editor cruft: `sodipodi:*` / `inkscape:*` attributes & elements. */
  removeEditorData?: boolean;
  /** Remove `<title>` and `<desc>` (accessibility text). Opt-in — default `false`. */
  removeTitle?: boolean;
  removeEmptyAttrs?: boolean;
  removeEmptyContainers?: boolean;
  /** Drop presentation attributes set to their SVG default (`fill-opacity="1"` …). */
  removeDefaultAttrs?: boolean;
  /** Hoist an inheritable attribute shared by every child of a group onto the group. Opt-in — default `false`. */
  moveElemsAttrsToGroup?: boolean;
  /** Remove `id`s that nothing references. Keeps referenced ids. */
  removeUnusedIds?: boolean;
  collapseWhitespace?: boolean;
  /** Round numbers in coords/paths/transforms to `precision` decimals. */
  roundNumbers?: boolean;
  /** Decimal places for numeric rounding. Default `3`. */
  precision?: number;
  normalizeColors?: boolean;
  /** Drop trivial no-op transforms (`translate(0)`, `scale(1)`, identity …). */
  cleanupTransforms?: boolean;
  /** Add a `viewBox` derived from `width`/`height` when missing. */
  addViewBox?: boolean;
  /** Add `width`/`height` derived from the `viewBox` when missing. Opt-in — default `false`. */
  addDimensions?: boolean;
  /** Remove `width`/`height` in favour of `viewBox`. Opt-in — default `false`. */
  removeDimensions?: boolean;
  /** Replace literal `fill`/`stroke` colours with `currentColor`. Opt-in — `true` or an options object. */
  currentColor?: boolean | CurrentColorOptions;
  /** Run the whole pipeline repeatedly until the output stabilizes. */
  multipass?: boolean;
  /** Pretty-print the result instead of minifying. */
  pretty?: boolean;
}

/** Result of {@link optimize}: the string plus a byte-savings report. */
export interface OptimizeResult {
  data: string;
  before: number;
  after: number;
  saved: number;
  /** Percent saved, 0–100, rounded to one decimal. */
  savedPct: number;
}

const NUMERIC_ATTRS = new Set([
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "dx", "dy", "offset", "stroke-width", "stroke-dashoffset",
  "opacity", "fill-opacity", "stroke-opacity", "stop-opacity", "font-size",
  "startOffset",
]);
const COLOR_ATTRS = new Set([
  "fill", "stroke", "stop-color", "color", "flood-color", "lighting-color",
]);
const CONTAINERS = new Set(["g", "defs", "a", "marker", "mask", "pattern", "switch"]);
/** Elements where whitespace-only text is significant and must be preserved. */
const TEXT_PRESERVING = new Set(["text", "tspan", "textPath", "tref", "style", "script", "title", "desc", "pre"]);
/** Editor-only namespace declarations that are safe to drop with editor data. */
const EDITOR_NS = new Set([
  "xmlns:inkscape", "xmlns:sodipodi", "xmlns:dc", "xmlns:cc", "xmlns:rdf",
  "xmlns:sketch", "xmlns:i", "xmlns:graph", "xmlns:x",
]);
/** Editor-specific attribute/element name prefixes (inkscape, sodipodi, sketch, adobe illustrator). */
const EDITOR_PREFIXES = ["sodipodi:", "inkscape:", "sketch:", "i:", "graph:"];
/** True when an attribute/element name belongs to an editor namespace. */
const isEditorName = (name: string): boolean =>
  EDITOR_PREFIXES.some((p) => name.startsWith(p)) || EDITOR_NS.has(name);

/** Presentation attributes whose listed value equals the SVG default (safe to drop). */
const DEFAULT_ATTRS: Record<string, string> = {
  "fill-opacity": "1", "stroke-opacity": "1", "opacity": "1", "stroke-width": "1",
  "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-miterlimit": "4",
  "stroke-dasharray": "none", "stroke-dashoffset": "0", "fill-rule": "nonzero",
  "clip-rule": "nonzero", "font-style": "normal", "font-weight": "normal",
  "font-stretch": "normal", "font-variant": "normal", "text-anchor": "start",
};
/** Inheritable presentation attributes eligible for hoisting onto a group. */
const INHERITABLE = new Set([
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset",
  "fill-opacity", "fill-rule", "clip-rule", "color", "font-family", "font-size",
  "font-weight", "font-style", "text-anchor", "letter-spacing", "word-spacing",
]);
const byteLen = (s: string): number => Buffer.byteLength(s, "utf8");

/** Optimize an SVG string. Parses, runs the pipeline, and serializes. */
export function optimize(input: string, opts: OptimizeOptions = {}): OptimizeResult {
  const before = byteLen(input);
  const precision = opts.precision ?? 3;
  const pretty = opts.pretty ?? false;

  const runOnce = (str: string): string => {
    const root = parseSvg(str);
    applyPipeline(root, opts, precision);
    return serialize(root, { pretty });
  };

  let out = runOnce(input);
  if (opts.multipass) {
    for (let n = 0; n < 8; n++) {
      const next = runOnce(out);
      if (next === out) break;
      out = next;
    }
  }

  const after = byteLen(out);
  const saved = before - after;
  const savedPct = before === 0 ? 0 : Math.round((saved / before) * 1000) / 10;
  return { data: out, before, after, saved, savedPct };
}

function on(v: boolean | undefined): boolean {
  return v !== false;
}

function applyPipeline(root: SvgRoot, opts: OptimizeOptions, precision: number): void {
  // --- top-level node stripping (comments, decl, doctype, PIs) -----------
  root.children = filterNodes(root.children, opts);

  // Collect referenced ids BEFORE we mutate, so we never drop a live one.
  const referenced = on(opts.removeUnusedIds) ? collectReferencedIds(root) : null;

  walk(root, (el, parent) => {
    stripElementChildren(el, opts);

    if (on(opts.removeEditorData)) {
      el.attributes = el.attributes.filter((a) => !isEditorName(a.name));
    }
    if (referenced) {
      const id = getAttr(el, "id");
      if (id !== undefined && !referenced.has(id)) removeAttr(el, "id");
    }
    if (on(opts.removeEmptyAttrs)) {
      el.attributes = el.attributes.filter(
        (a) => !(a.quote !== "" && a.value.trim() === "" && a.name !== "d"),
      );
    }
    if (on(opts.cleanupTransforms)) cleanupTransform(el);
    if (on(opts.roundNumbers)) roundElementNumbers(el, precision);
    if (on(opts.normalizeColors)) normalizeElementColors(el);
    if (opts.currentColor) {
      const cc: CurrentColorOptions = opts.currentColor === true ? {} : opts.currentColor;
      currentColorizeElement(el, cc);
    }
    if (on(opts.removeDefaultAttrs)) removeDefaultElementAttrs(el);
    if (on(opts.collapseWhitespace)) collapseElementWhitespace(el);
    void parent;
  });

  // Hoisting common child attributes onto a group needs the whole subtree.
  if (opts.moveElemsAttrsToGroup === true) hoistCommonAttrs(root);

  // Empty-container removal needs a post-order pass (children first).
  if (on(opts.removeEmptyContainers)) removeEmptyContainers(root);

  // viewBox <-> dimensions on the root <svg>.
  const svg = findRootSvg(root);
  if (svg) handleDimensions(svg, opts);
}

function filterNodes(nodes: SvgNode[], opts: OptimizeOptions): SvgNode[] {
  return nodes.filter((n) => {
    if (n.type === "comment") return !on(opts.removeComments);
    if (n.type === "doctype") return !on(opts.removeDoctype);
    if (n.type === "pi") {
      if (n.target === "xml") return !on(opts.removeXmlDeclaration);
      if (n.target === "xml-stylesheet") return !on(opts.removeXmlDeclaration);
      return true;
    }
    return true;
  });
}

/** Remove stripped child nodes (comments, metadata, editor elements, title). */
function stripElementChildren(el: SvgElement, opts: OptimizeOptions): void {
  el.children = el.children.filter((c) => {
    if (c.type === "comment") return !on(opts.removeComments);
    if (c.type === "pi" && (c.target === "xml" || c.target === "xml-stylesheet")) {
      return !on(opts.removeXmlDeclaration);
    }
    if (c.type === "element") {
      if (c.name === "metadata" && on(opts.removeMetadata)) return false;
      if ((c.name === "title" || c.name === "desc") && opts.removeTitle === true) return false;
      if (on(opts.removeEditorData) && isEditorName(c.name)) {
        return false;
      }
    }
    return true;
  });
}

/** Find every id referenced via `url(#id)`, `href="#id"` or `xlink:href="#id"`. */
export function collectReferencedIds(root: SvgRoot): Set<string> {
  const ids = new Set<string>();
  const urlRe = /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g;
  walk(root, (el) => {
    for (const a of el.attributes) {
      if (a.name === "href" || a.name === "xlink:href") {
        const m = /^#(.+)$/.exec(a.value.trim());
        if (m) ids.add(m[1]!);
      }
      let m: RegExpExecArray | null;
      urlRe.lastIndex = 0;
      while ((m = urlRe.exec(a.value)) !== null) ids.add(m[1]!);
    }
  });
  return ids;
}

function removeEmptyContainers(node: SvgRoot | SvgElement): void {
  const kids = node.children;
  for (const child of kids) {
    if (child.type === "element") removeEmptyContainers(child);
  }
  node.children = kids.filter((c) => {
    if (c.type !== "element") return true;
    if (!CONTAINERS.has(c.name)) return true;
    const meaningful = c.children.some(
      (k) => k.type === "element" || (k.type === "text" && k.value.trim() !== "") || k.type === "cdata",
    );
    // Keep an empty container that is itself a reference target.
    if (getAttr(c, "id") !== undefined) return true;
    return meaningful;
  });
}

/** Drop presentation attributes whose value equals the SVG default. */
function removeDefaultElementAttrs(el: SvgElement): void {
  el.attributes = el.attributes.filter((a) => {
    const def = DEFAULT_ATTRS[a.name];
    if (def === undefined) return true;
    const v = a.value.trim();
    if (v === def) return false;
    const dn = Number(def);
    const vn = Number(v);
    if (Number.isFinite(dn) && Number.isFinite(vn) && dn === vn) return false;
    return true;
  });
}

/** Hoist an inheritable attribute shared (identically) by every element child of a group. */
function hoistCommonAttrs(root: SvgRoot): void {
  const visit = (el: SvgElement): void => {
    for (const c of el.children) if (c.type === "element") visit(c);
    if (!CONTAINERS.has(el.name)) return;
    const kids = el.children.filter((c): c is SvgElement => c.type === "element");
    if (kids.length < 2) return;
    const first = kids[0]!;
    for (const a of [...first.attributes]) {
      if (!INHERITABLE.has(a.name)) continue;
      if (getAttr(el, a.name) !== undefined) continue; // group already sets it
      const val = a.value;
      if (!kids.every((k) => getAttr(k, a.name) === val)) continue;
      setAttr(el, a.name, val);
      for (const k of kids) removeAttr(k, a.name);
    }
  };
  for (const c of root.children) if (c.type === "element") visit(c);
}

// ------------------------------ transforms ---------------------------------

function cleanupTransform(el: SvgElement): void {
  for (const attr of ["transform", "gradientTransform", "patternTransform"]) {
    const v = getAttr(el, attr);
    if (v === undefined) continue;
    const cleaned = stripTrivialTransforms(v);
    if (cleaned === "") removeAttr(el, attr);
    else if (cleaned !== v) setAttr(el, attr, cleaned);
  }
}

/** Remove no-op transform functions (`translate(0)`, `scale(1)`, identity matrix). */
export function stripTrivialTransforms(value: string): string {
  const parts = value.match(/[a-zA-Z]+\s*\([^)]*\)/g);
  if (!parts) return value.trim();
  const kept: string[] = [];
  for (const raw of parts) {
    const m = /^([a-zA-Z]+)\s*\(([^)]*)\)$/.exec(raw.trim());
    if (!m) {
      kept.push(raw.trim());
      continue;
    }
    const fn = m[1]!;
    const nums = m[2]!.trim().split(/[\s,]+/).filter((s) => s !== "").map(Number);
    if (isTrivialTransform(fn, nums)) continue;
    // Normalize translate(x,0) -> translate(x); scale(s,s) -> scale(s)
    let args = m[2]!.trim().split(/[\s,]+/).filter((s) => s !== "");
    if (fn === "translate" && args.length === 2 && Number(args[1]) === 0) args = [args[0]!];
    if (fn === "scale" && args.length === 2 && args[0] === args[1]) args = [args[0]!];
    kept.push(`${fn}(${args.join(" ")})`);
  }
  return kept.join(" ");
}

function isTrivialTransform(fn: string, nums: number[]): boolean {
  const allZero = nums.every((n) => n === 0);
  switch (fn) {
    case "translate":
      return nums.length === 0 || allZero;
    case "rotate":
      return nums.length >= 1 && nums[0] === 0 && (nums.length === 1 || (nums[1] === 0 && nums[2] === 0));
    case "skewX":
    case "skewY":
      return nums.length === 1 && nums[0] === 0;
    case "scale":
      return nums.every((n) => n === 1) && nums.length >= 1;
    case "matrix":
      return nums.length === 6 && nums[0] === 1 && nums[1] === 0 && nums[2] === 0 && nums[3] === 1 && nums[4] === 0 && nums[5] === 0;
    default:
      return false;
  }
}

// ------------------------------ numbers ------------------------------------

/** Round a single number to `precision` decimals, stripping trailing zeros. */
export function roundNumber(n: number, precision: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Number(n.toFixed(precision));
  return String(r);
}

/** Round every number in a string (path data, transform list, points). */
export function roundNumbersIn(str: string, precision: number): string {
  return str.replace(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g, (m) => roundNumber(Number(m), precision));
}

function roundElementNumbers(el: SvgElement, precision: number): void {
  for (const a of el.attributes) {
    if (a.name === "d" || a.name === "points" || a.name === "transform" ||
        a.name === "gradientTransform" || a.name === "patternTransform" ||
        a.name === "viewBox" || NUMERIC_ATTRS.has(a.name)) {
      a.value = roundNumbersIn(a.value, precision);
    }
  }
}

// ------------------------------ colors -------------------------------------

/** Normalize a colour token: shorten/lowercase hex, `rgb(...)` → hex. */
export function normalizeColor(value: string): string {
  let v = value.trim();
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(v);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("");
    v = "#" + hex;
  }
  const long = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (long) {
    const h = long[1]!.toLowerCase();
    if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) {
      return "#" + h[0]! + h[2]! + h[4]!;
    }
    return "#" + h;
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (short) return "#" + short[1]!.toLowerCase();
  return value;
}

function normalizeElementColors(el: SvgElement): void {
  for (const a of el.attributes) {
    if (COLOR_ATTRS.has(a.name)) {
      a.value = normalizeColor(a.value);
    } else if (a.name === "style") {
      a.value = a.value.replace(
        /(fill|stroke|stop-color|color|flood-color|lighting-color)\s*:\s*([^;]+)/gi,
        (_all, prop: string, val: string) => `${prop}:${normalizeColor(val)}`,
      );
    }
  }
}

// ------------------------------ whitespace ---------------------------------

function collapseElementWhitespace(el: SvgElement): void {
  // Drop insignificant whitespace-only text between children (not in text nodes).
  if (!TEXT_PRESERVING.has(el.name)) {
    el.children = el.children.filter((c) => !(c.type === "text" && c.value.trim() === ""));
  }
  for (const a of el.attributes) {
    if (a.name === "d") {
      a.value = a.value.replace(/\s+/g, " ").replace(/\s*([MmLlHhVvCcSsQqTtAaZz])\s*/g, "$1").trim();
    } else if (a.name === "points" || a.name === "viewBox") {
      a.value = a.value.trim().replace(/\s+/g, " ");
    }
  }
}

// ------------------------------ dimensions ---------------------------------

function handleDimensions(svg: SvgElement, opts: OptimizeOptions): void {
  const w = getAttr(svg, "width");
  const h = getAttr(svg, "height");
  const vb = getAttr(svg, "viewBox");

  if (on(opts.addViewBox) && !vb && w && h) {
    const wn = parseFloat(w);
    const hn = parseFloat(h);
    if (Number.isFinite(wn) && Number.isFinite(hn) && /^\d*\.?\d+$/.test(w.trim()) && /^\d*\.?\d+$/.test(h.trim())) {
      setAttr(svg, "viewBox", `0 0 ${wn} ${hn}`);
    }
  }
  if (opts.addDimensions === true && (!w || !h)) {
    const cur = getAttr(svg, "viewBox");
    const nums = cur ? cur.trim().split(/[\s,]+/).map(Number) : [];
    if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
      if (!w) setAttr(svg, "width", String(nums[2]));
      if (!h) setAttr(svg, "height", String(nums[3]));
    }
  }
  if (opts.removeDimensions === true && getAttr(svg, "viewBox")) {
    removeAttr(svg, "width");
    removeAttr(svg, "height");
  }
}
