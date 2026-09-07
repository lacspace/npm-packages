/**
 * Combine many SVGs into a single `<svg>` sprite sheet of `<symbol>`s, each
 * addressable with `<use href="#id">`. Every symbol is optimized first and
 * carries the source `viewBox` so it scales correctly wherever it's used.
 */

import type { SvgElement, SvgNode, SvgRoot } from "./parse.js";
import type { OptimizeOptions } from "./optimize.js";
import { parseSvg, serialize, findRootSvg, getAttr } from "./parse.js";
import { optimize } from "./optimize.js";

/** One source SVG plus the id its symbol should get. */
export interface SpriteInput {
  /** Symbol id — typically derived from the file's base name. */
  id: string;
  /** The raw SVG string. */
  svg: string;
}

/** Options for {@link buildSprite}. */
export interface SpriteOptions {
  /** Optimize each symbol first. Default `true`. Pass options to tune. */
  optimize?: boolean | OptimizeOptions;
  /** Pretty-print the sprite. Default `false`. */
  pretty?: boolean;
}

/** Result of {@link buildSprite}. */
export interface SpriteResult {
  data: string;
  symbols: { id: string; viewBox?: string }[];
  /** A copy-paste usage snippet for the produced symbols. */
  usage: string;
}

/** Turn an arbitrary string into a safe, unique SVG id. */
export function sanitizeId(raw: string, taken?: Set<string>): string {
  let id = raw.replace(/\.svg$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id) id = "icon";
  if (/^[0-9]/.test(id)) id = "icon-" + id;
  if (taken) {
    let base = id;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
  }
  return id;
}

/** Build an SVG sprite (symbol sheet) from many SVGs. */
export function buildSprite(inputs: SpriteInput[], opts: SpriteOptions = {}): SpriteResult {
  const doOpt = opts.optimize ?? true;
  const taken = new Set<string>();
  const symbols: SvgElement[] = [];
  const meta: { id: string; viewBox?: string }[] = [];

  for (const input of inputs) {
    const id = sanitizeId(input.id, taken);
    let svgStr = input.svg;
    if (doOpt !== false) {
      const oopts: OptimizeOptions = typeof doOpt === "object" ? doOpt : {};
      svgStr = optimize(input.svg, oopts).data;
    }
    const root = parseSvg(svgStr);
    const svg = findRootSvg(root);
    if (!svg) continue;

    const viewBox = getAttr(svg, "viewBox") ?? deriveViewBox(svg);
    const attrs: SvgElement["attributes"] = [{ name: "id", value: id, quote: '"' }];
    if (viewBox) attrs.push({ name: "viewBox", value: viewBox, quote: '"' });
    // Preserve overflow/preserveAspectRatio if the source set them.
    for (const keep of ["preserveAspectRatio"]) {
      const v = getAttr(svg, keep);
      if (v !== undefined) attrs.push({ name: keep, value: v, quote: '"' });
    }

    const symbol: SvgElement = {
      type: "element",
      name: "symbol",
      attributes: attrs,
      children: svg.children.filter(keepInSymbol),
      selfClosing: false,
    };
    symbols.push(symbol);
    meta.push(viewBox ? { id, viewBox } : { id });
  }

  const spriteRoot: SvgRoot = {
    type: "root",
    children: [
      {
        type: "element",
        name: "svg",
        attributes: [
          { name: "xmlns", value: "http://www.w3.org/2000/svg", quote: '"' },
          { name: "xmlns:xlink", value: "http://www.w3.org/1999/xlink", quote: '"' },
          { name: "style", value: "display:none", quote: '"' },
        ],
        children: symbols,
        selfClosing: false,
      },
    ],
  };

  const data = serialize(spriteRoot, { pretty: opts.pretty ?? false });
  const usage = meta
    .map((m) => `<svg><use href="#${m.id}"></use></svg>`)
    .join("\n");

  return { data, symbols: meta, usage };
}

function keepInSymbol(node: SvgNode): boolean {
  // Drop the XML declaration / doctype / comments that may linger; keep drawing.
  return node.type === "element" || node.type === "text" || node.type === "cdata";
}

function deriveViewBox(svg: SvgElement): string | undefined {
  const w = getAttr(svg, "width");
  const h = getAttr(svg, "height");
  if (w && h && /^\d*\.?\d+$/.test(w.trim()) && /^\d*\.?\d+$/.test(h.trim())) {
    return `0 0 ${parseFloat(w)} ${parseFloat(h)}`;
  }
  return undefined;
}
