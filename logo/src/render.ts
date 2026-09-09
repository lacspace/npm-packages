/** Shared render context, the wordmark, layout composition and the SVG wrapper. */
import type { Background, FontPair, IconDef, Layout, Palette, ShapeKind } from "./types.js";
import type { Rng } from "./rng.js";
import { estimateTextWidth, esc } from "./text.js";

export interface Spec {
  name: string;
  initials: string;
  letter: string;
  palette: Palette;
  font: FontPair;
  icon?: IconDef;
  shape: ShapeKind;
  layout: Layout;
  size: number;
  background: Background;
  rng: Rng;
  tokens: string[];
  embedFont: boolean;
  /** Deterministic id generator for gradients/paths (seed-derived, no globals). */
  uid: (prefix?: string) => string;
}

export interface Mark {
  /** SVG body drawn in a `size`×`size` box at the origin. */
  svg: string;
  size: number;
  /** Extra <defs> content (gradients) this mark needs. */
  defs?: string;
}

const nn = (v: number) => Math.round(v * 100) / 100;

/** Google-fonts @import so a standalone .svg still renders with the right face in a browser. */
function fontImport(font: FontPair): string {
  const fam = font.display.replace(/ /g, "+");
  return `<style>@import url('https://fonts.googleapis.com/css2?family=${fam}:wght@${font.weight}&amp;display=swap');</style>`;
}

/** Colour used for wordmark text given the background. */
function inkColor(spec: Spec): string {
  return spec.background === "transparent" ? spec.palette.primary : spec.palette.on;
}

/** The wordmark text element(s). */
export function wordmarkEl(spec: Spec, x: number, y: number, fontSize: number, anchor: "start" | "middle"): string {
  const isLuxe = spec.font.mood.includes("luxe") || spec.font.mood.includes("elegant");
  const tracking = isLuxe ? fontSize * 0.04 : 0;
  const ls = tracking ? ` letter-spacing="${nn(tracking)}"` : "";
  return `<text x="${nn(x)}" y="${nn(y)}" font-family="${spec.font.stack}" font-weight="${spec.font.weight}" font-size="${nn(fontSize)}" fill="${inkColor(spec)}" text-anchor="${anchor}" dominant-baseline="middle"${ls}>${esc(spec.name)}</text>`;
}

function background(spec: Spec, w: number, h: number, defsId: string): string {
  if (spec.background === "transparent") return "";
  if (spec.background === "solid") return `<rect width="${w}" height="${h}" fill="${spec.palette.bg}"/>`;
  if (spec.background === "surface") return `<rect width="${w}" height="${h}" fill="${spec.palette.surface}"/>`;
  return `<rect width="${w}" height="${h}" fill="url(#${defsId})"/>`; // gradient
}

/** Wrap body + defs in a complete, self-contained SVG string. */
export function wrapSvg(spec: Spec, w: number, h: number, defs: string, body: string): string {
  const bgId = "bg";
  const bgDefs = spec.background === "gradient"
    ? `<linearGradient id="${bgId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${spec.palette.from}"/><stop offset="1" stop-color="${spec.palette.to}"/></linearGradient>`
    : "";
  const fontStyle = spec.embedFont ? fontImport(spec.font) : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${nn(w)}" height="${nn(h)}" viewBox="0 0 ${nn(w)} ${nn(h)}" role="img" aria-label="${esc(spec.name)} logo">` +
    fontStyle +
    `<defs>${bgDefs}${defs}</defs>` +
    background(spec, w, h, bgId) +
    body +
    `</svg>`
  );
}

/** Compose a mark + wordmark into a finished logo per the layout. */
export function compose(spec: Spec, mark: Mark): { svg: string; width: number; height: number } {
  const pad = Math.round(spec.size * 0.12);
  const defs = mark.defs ?? "";

  if (spec.layout === "mark-only" || spec.layout === "emblem") {
    const w = mark.size + pad * 2;
    const body = `<g transform="translate(${pad} ${pad})">${mark.svg}</g>`;
    return { svg: wrapSvg(spec, w, w, defs, body), width: w, height: w };
  }

  if (spec.layout === "wordmark-only") {
    const fontSize = Math.round(spec.size * 0.4);
    const tw = estimateTextWidth(spec.name, fontSize, spec.font.mood.includes("luxe") ? fontSize * 0.04 : 0);
    const w = Math.round(tw + pad * 2);
    const h = Math.round(fontSize * 1.5);
    // small accent tick before the word
    const tick = `<rect x="${pad - Math.round(spec.size * 0.03)}" y="${Math.round(h / 2 - fontSize * 0.36)}" width="${Math.round(spec.size * 0.014)}" height="${Math.round(fontSize * 0.72)}" rx="2" fill="${spec.palette.primary}"/>`;
    const body = tick + wordmarkEl(spec, pad, h / 2, fontSize, "start");
    return { svg: wrapSvg(spec, w, h, defs, body), width: w, height: h };
  }

  if (spec.layout === "icon-top" || spec.layout === "stacked") {
    const markSize = spec.size;
    const fontSize = Math.round(spec.size * (spec.layout === "stacked" ? 0.34 : 0.28));
    const gap = Math.round(spec.size * 0.14);
    const tw = estimateTextWidth(spec.name, fontSize, spec.font.mood.includes("luxe") ? fontSize * 0.04 : 0);
    const w = Math.round(Math.max(markSize, tw) + pad * 2);
    const h = Math.round(markSize + gap + fontSize * 1.3 + pad);
    const markX = (w - markSize) / 2;
    const body =
      `<g transform="translate(${nn(markX)} ${pad})">${mark.svg}</g>` +
      wordmarkEl(spec, w / 2, pad + markSize + gap + fontSize * 0.5, fontSize, "middle");
    return { svg: wrapSvg(spec, w, h, defs, body), width: w, height: h };
  }

  // icon-left (default lockup)
  const markSize = spec.size;
  const fontSize = Math.round(spec.size * 0.4);
  const gap = Math.round(spec.size * 0.16);
  const tw = estimateTextWidth(spec.name, fontSize, spec.font.mood.includes("luxe") ? fontSize * 0.04 : 0);
  const w = Math.round(markSize + gap + tw + pad * 2);
  const h = Math.round(markSize + pad * 2);
  const body =
    `<g transform="translate(${pad} ${pad})">${mark.svg}</g>` +
    wordmarkEl(spec, pad + markSize + gap, h / 2, fontSize, "start");
  return { svg: wrapSvg(spec, w, h, defs, body), width: w, height: h };
}
