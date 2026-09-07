/**
 * Additional pure manipulations: invert, complement, and perceptual (OKLab)
 * mixing. All return a normalised `#hex` string, matching the core helpers.
 * Zero-dep, isomorphic.
 */

import { parse, toHex, rotate, type RGBA } from "./index";
import { rgbToOklab, oklabToRgb } from "./convert";

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const toRgba = (c: RGBA | string): RGBA => (typeof c === "string" ? parse(c) : c);

/** Invert each RGB channel (255 − v). Alpha is preserved. */
export function invert(c: RGBA | string): string {
  const { r, g, b, a } = toRgba(c);
  return toHex({ r: 255 - r, g: 255 - g, b: 255 - b, a });
}

/** The complementary colour (hue rotated 180°). */
export const complement = (c: RGBA | string): string => rotate(c, 180);

/**
 * Perceptually mix two colours in OKLab space; `weight` is how much of `b`
 * (0–1, default 0.5). Produces more natural midpoints than sRGB `mix`.
 */
export function mixOklab(a: RGBA | string, b: RGBA | string, weight = 0.5): string {
  const la = rgbToOklab(a), lb = rgbToOklab(b);
  const w = clamp01(weight);
  return toHex(
    oklabToRgb({
      L: la.L + (lb.L - la.L) * w,
      a: la.a + (lb.a - la.a) * w,
      b: la.b + (lb.b - la.b) * w,
      alpha: la.alpha + (lb.alpha - la.alpha) * w,
    }),
  );
}
