/**
 * Extra colour-space conversions layered on top of the core RGBA model:
 * HSV / HSB and the modern, perceptually-uniform OKLab / OKLCH.
 * Zero-dep, isomorphic — pure maths only.
 */

import { parse, type RGBA } from "./index";

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const r4 = (n: number): number => Math.round(n * 10000) / 10000;
const toRgba = (c: RGBA | string): RGBA => (typeof c === "string" ? parse(c) : c);

/* --------------------------------- HSV / HSB --------------------------------- */

export interface HSVA { h: number; s: number; v: number; a: number; }

/** RGBA → HSVA (a.k.a. HSB). `h` 0–360, `s`/`v` 0–100. */
export function toHsvObject(c: RGBA | string): HSVA {
  const { r, g, b, a } = toRgba(c);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: r3(h), s: r3(s * 100), v: r3(max * 100), a };
}

/** HSVA → RGBA. */
export function hsvToRgb(hsv: HSVA): RGBA {
  const h = (((hsv.h % 360) + 360) % 360) / 60;
  const s = clamp01(hsv.s / 100), v = clamp01(hsv.v / 100);
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let rn = 0, gn = 0, bn = 0;
  switch (i % 6) {
    case 0: rn = v; gn = t; bn = p; break;
    case 1: rn = q; gn = v; bn = p; break;
    case 2: rn = p; gn = v; bn = t; break;
    case 3: rn = p; gn = q; bn = v; break;
    case 4: rn = t; gn = p; bn = v; break;
    default: rn = v; gn = p; bn = q; break;
  }
  return { r: Math.round(rn * 255), g: Math.round(gn * 255), b: Math.round(bn * 255), a: hsv.a };
}

/** RGBA → `hsv()` string (e.g. `hsv(0, 100%, 100%)`). */
export function toHsv(c: RGBA | string): string {
  const { h, s, v, a } = toHsvObject(c);
  const base = `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(v)}%`;
  return a < 1 ? `hsva(${base}, ${r3(a)})` : `hsv(${base})`;
}

/* --------------------------------- OKLab / OKLCH --------------------------------- */

export interface OKLab { L: number; a: number; b: number; alpha: number; }
export interface OKLCH { l: number; c: number; h: number; a: number; }

const srgbToLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number): number => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(s * 255)));
};

/** RGBA → OKLab. `L` ~0–1, `a`/`b` unbounded (typically ±0.4). */
export function rgbToOklab(c: RGBA | string): OKLab {
  const { r, g, b, a } = toRgba(c);
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: r4(0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_),
    a: r4(1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_),
    b: r4(0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_),
    alpha: a,
  };
}

/** OKLab → RGBA (channels clamped into the sRGB gamut). */
export function oklabToRgb(lab: OKLab): RGBA {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b), a: lab.alpha };
}

/** RGBA → OKLCH. `l` ~0–1, `c` chroma ≥0, `h` hue 0–360. */
export function rgbToOklch(c: RGBA | string): OKLCH {
  const { L, a, b, alpha } = rgbToOklab(c);
  const chroma = Math.sqrt(a * a + b * b);
  let hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { l: r4(L), c: r4(chroma), h: chroma < 1e-4 ? 0 : r3(hue), a: alpha };
}

/** OKLCH → RGBA. */
export function oklchToRgb(lch: OKLCH): RGBA {
  const hr = (lch.h * Math.PI) / 180;
  return oklabToRgb({ L: lch.l, a: Math.cos(hr) * lch.c, b: Math.sin(hr) * lch.c, alpha: lch.a });
}

/** RGBA → OKLab, alias of {@link rgbToOklab} for symmetry with the `to*` family. */
export const toOklabObject = rgbToOklab;
/** RGBA → OKLCH object. */
export const toOklchObject = rgbToOklch;

/** RGBA → `oklch(L C H)` string (CSS Color 4). Alpha appended as `/ a` when < 1. */
export function toOklch(c: RGBA | string): string {
  const { l, c: chroma, h, a } = rgbToOklch(c);
  const base = `${r3(l)} ${r3(chroma)} ${r3(h)}`;
  return a < 1 ? `oklch(${base} / ${r3(a)})` : `oklch(${base})`;
}

/** RGBA → `oklab(L a b)` string (CSS Color 4). */
export function toOklab(c: RGBA | string): string {
  const { L, a, b, alpha } = rgbToOklab(c);
  const base = `${r3(L)} ${r3(a)} ${r3(b)}`;
  return alpha < 1 ? `oklab(${base} / ${r3(alpha)})` : `oklab(${base})`;
}
