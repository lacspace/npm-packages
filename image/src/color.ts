/**
 * Tiny, dependency-free colour parser → RGBA tuple (0..255 each).
 * Supports: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(), and "transparent".
 */

import type { Color } from "./types.js";

export type RGBA = [number, number, number, number];

const NAMED: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 255],
  white: [255, 255, 255, 255],
  red: [255, 0, 0, 255],
  green: [0, 128, 0, 255],
  blue: [0, 0, 255, 255],
};

function clampByte(n: number): number {
  n = Math.round(n);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

export function parseColor(input: Color): RGBA {
  const s = String(input).trim().toLowerCase();
  if (s in NAMED) return [...NAMED[s]!] as RGBA;

  if (s[0] === "#") {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      const a = hex.length === 4 ? parseInt(hex[3]! + hex[3]!, 16) : 255;
      return [r, g, b, a];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      return [r, g, b, a];
    }
  }

  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1]!.split(/[,/\s]+/).filter(Boolean);
    const r = clampByte(parseFloat(parts[0] ?? "0"));
    const g = clampByte(parseFloat(parts[1] ?? "0"));
    const b = clampByte(parseFloat(parts[2] ?? "0"));
    let a = 255;
    if (parts[3] != null) {
      const av = parseFloat(parts[3]);
      a = parts[3].includes("%") ? clampByte((av / 100) * 255) : clampByte(av <= 1 ? av * 255 : av);
    }
    return [r, g, b, a];
  }

  // Unknown — fail soft to opaque black so a bad token never crashes a render.
  return [0, 0, 0, 255];
}

/** Alpha-over composite of `src` onto `dst` (both premultiplied by their own alpha here). */
export function blendOver(dst: RGBA, src: RGBA): RGBA {
  const sa = src[3] / 255;
  const da = dst[3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return [0, 0, 0, 0];
  const r = (src[0] * sa + dst[0] * da * (1 - sa)) / outA;
  const g = (src[1] * sa + dst[1] * da * (1 - sa)) / outA;
  const b = (src[2] * sa + dst[2] * da * (1 - sa)) / outA;
  return [clampByte(r), clampByte(g), clampByte(b), clampByte(outA * 255)];
}

/** Linear interpolation between two colours at t in 0..1. */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    clampByte(a[0] + (b[0] - a[0]) * t),
    clampByte(a[1] + (b[1] - a[1]) * t),
    clampByte(a[2] + (b[2] - a[2]) * t),
    clampByte(a[3] + (b[3] - a[3]) * t),
  ];
}
