/**
 * @lacspace/color
 *
 * Parse, convert, manipulate and check colours — hex / rgb / hsl, lighten /
 * darken / mix / alpha, and WCAG contrast for accessible palettes.
 * Zero dependencies, isomorphic.
 */

export interface RGBA { r: number; g: number; b: number; a: number; }

const clamp = (n: number, lo = 0, hi = 255): number => Math.min(hi, Math.max(lo, n));
const round = (n: number): number => Math.round(n * 1000) / 1000;

/* ------------------------------ parsing ------------------------------ */

/** Parse a colour string (#hex, #rgba, rgb(), rgba(), hsl(), hsla()) → RGBA. */
export function parse(input: string): RGBA {
  const s = input.trim().toLowerCase();

  if (s.startsWith("#")) {
    const h = s.slice(1);
    const hex =
      h.length === 3 || h.length === 4
        ? h.split("").map((c) => c + c).join("")
        : h;
    if ((hex.length !== 6 && hex.length !== 8) || !/^[0-9a-f]+$/.test(hex))
      throw new Error(`Invalid hex colour: ${input}`);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(s);
  if (rgb) {
    const p = rgb[1]!.split(/[,\s/]+/).filter(Boolean);
    const r = +p[0]!, g = +p[1]!, b = +p[2]!;
    const a = p[3] !== undefined ? +p[3]! : 1;
    if (![r, g, b, a].every(Number.isFinite)) throw new Error(`Invalid rgb colour: ${input}`);
    return { r: clamp(r), g: clamp(g), b: clamp(b), a: p[3] !== undefined ? clamp(a, 0, 1) : 1 };
  }

  const hsl = /^hsla?\(([^)]+)\)$/.exec(s);
  if (hsl) {
    const p = hsl[1]!.split(/[,\s/]+/).filter(Boolean);
    const h = +p[0]!, sv = parseFloat(p[1]!), l = parseFloat(p[2]!);
    const a = p[3] !== undefined ? +p[3]! : 1;
    if (![h, sv, l, a].every(Number.isFinite)) throw new Error(`Invalid hsl colour: ${input}`);
    return hslToRgb({ h, s: sv, l, a });
  }

  throw new Error(`Unrecognised colour: ${input}`);
}

/* ------------------------------ formatting ------------------------------ */

const h2 = (n: number): string => clamp(Math.round(n)).toString(16).padStart(2, "0");

/** RGBA → hex string. Includes alpha only when < 1. */
export function toHex(c: RGBA | string): string {
  const { r, g, b, a } = typeof c === "string" ? parse(c) : c;
  return `#${h2(r)}${h2(g)}${h2(b)}${a < 1 ? h2(a * 255) : ""}`;
}

/** RGBA → `rgb()` / `rgba()` string. */
export function toRgb(c: RGBA | string): string {
  const { r, g, b, a } = typeof c === "string" ? parse(c) : c;
  const R = Math.round(r), G = Math.round(g), B = Math.round(b);
  return a < 1 ? `rgba(${R}, ${G}, ${B}, ${round(a)})` : `rgb(${R}, ${G}, ${B})`;
}

export interface HSLA { h: number; s: number; l: number; a: number; }

/** RGBA → HSLA (h 0–360, s/l 0–100). */
export function toHslObject(c: RGBA | string): HSLA {
  const { r, g, b, a } = typeof c === "string" ? parse(c) : c;
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h: round(h), s: round(s * 100), l: round(l * 100), a };
}

/** RGBA → `hsl()` / `hsla()` string. */
export function toHsl(c: RGBA | string): string {
  const { h, s, l, a } = toHslObject(c);
  return a < 1 ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${round(a)})` : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/** HSLA → RGBA. */
export function hslToRgb(hsl: HSLA): RGBA {
  const h = ((hsl.h % 360) + 360) % 360 / 360;
  const s = hsl.s / 100, l = hsl.l / 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v, a: hsl.a }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(hue(h + 1 / 3) * 255), g: Math.round(hue(h) * 255), b: Math.round(hue(h - 1 / 3) * 255), a: hsl.a };
}

/* ------------------------------ manipulation ------------------------------ */

const withHsl = (c: RGBA | string, fn: (h: HSLA) => HSLA): string => toHex(hslToRgb(fn(toHslObject(c))));

/** Lighten by `amount` (0–100 lightness points). */
export const lighten = (c: RGBA | string, amount: number): string => withHsl(c, (h) => ({ ...h, l: clamp(h.l + amount, 0, 100) }));
/** Darken by `amount` (0–100 lightness points). */
export const darken = (c: RGBA | string, amount: number): string => withHsl(c, (h) => ({ ...h, l: clamp(h.l - amount, 0, 100) }));
/** Increase saturation by `amount` (0–100). */
export const saturate = (c: RGBA | string, amount: number): string => withHsl(c, (h) => ({ ...h, s: clamp(h.s + amount, 0, 100) }));
/** Decrease saturation by `amount` (0–100). */
export const desaturate = (c: RGBA | string, amount: number): string => withHsl(c, (h) => ({ ...h, s: clamp(h.s - amount, 0, 100) }));
/** Rotate the hue by `deg` degrees. */
export const rotate = (c: RGBA | string, deg: number): string => withHsl(c, (h) => ({ ...h, h: (h.h + deg) % 360 }));
/** Set the alpha channel (0–1). */
export function alpha(c: RGBA | string, a: number): string {
  const col = typeof c === "string" ? parse(c) : c;
  return toRgb({ ...col, a: clamp(a, 0, 1) });
}
/** Convert to greyscale (luminance-preserving). */
export const grayscale = (c: RGBA | string): string => withHsl(c, (h) => ({ ...h, s: 0 }));

/** Mix two colours; `weight` is how much of `b` (0–1, default 0.5). */
export function mix(a: RGBA | string, b: RGBA | string, weight = 0.5): string {
  const ca = typeof a === "string" ? parse(a) : a;
  const cb = typeof b === "string" ? parse(b) : b;
  const w = clamp(weight, 0, 1);
  return toHex({
    r: ca.r + (cb.r - ca.r) * w,
    g: ca.g + (cb.g - ca.g) * w,
    b: ca.b + (cb.b - ca.b) * w,
    a: ca.a + (cb.a - ca.a) * w,
  });
}

/* ------------------------------ accessibility ------------------------------ */

/** Relative luminance (WCAG). */
export function luminance(c: RGBA | string): number {
  const { r, g, b } = typeof c === "string" ? parse(c) : c;
  const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: RGBA | string, b: RGBA | string): number {
  const la = luminance(a), lb = luminance(b);
  return round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05));
}

/** Does the pair meet a WCAG level? `AA` (4.5), `AA-large` (3), `AAA` (7). */
export function isReadable(a: RGBA | string, b: RGBA | string, level: "AA" | "AA-large" | "AAA" = "AA"): boolean {
  const ratio = contrast(a, b);
  return ratio >= (level === "AAA" ? 7 : level === "AA-large" ? 3 : 4.5);
}

/** Pick black or white — whichever is more readable on the given background. */
export function readableTextColor(background: RGBA | string): "#000000" | "#ffffff" {
  return contrast(background, "#ffffff") >= contrast(background, "#000000") ? "#ffffff" : "#000000";
}

/** True if the colour is perceptually dark (luminance < 0.5). */
export const isDark = (c: RGBA | string): boolean => luminance(c) < 0.5;
