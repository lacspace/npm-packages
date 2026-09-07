/**
 * Palette generation: tint/shade scales and classic colour-wheel harmonies.
 * Every entry is a normalised `#hex` string. Zero-dep, isomorphic.
 */

import { mix, rotate, toHex, parse, type RGBA } from "./index";

const norm = (c: RGBA | string): string => toHex(typeof c === "string" ? parse(c) : c);

/**
 * Progressively lighter variants of `base` (mixed toward white).
 * Returns `steps` colours, none pure white, lightest last.
 */
export function tints(base: RGBA | string, steps = 5): string[] {
  const out: string[] = [];
  for (let i = 1; i <= steps; i++) out.push(mix(base, "#ffffff", i / (steps + 1)));
  return out;
}

/**
 * Progressively darker variants of `base` (mixed toward black).
 * Returns `steps` colours, none pure black, darkest last.
 */
export function shades(base: RGBA | string, steps = 5): string[] {
  const out: string[] = [];
  for (let i = 1; i <= steps; i++) out.push(mix(base, "#000000", i / (steps + 1)));
  return out;
}

/**
 * A full tonal scale of `base`, light → dark, `base` sitting at the midpoint.
 * `steps` swatches (default 10), all sharing the base hue.
 */
export function scale(base: RGBA | string, steps = 10): string[] {
  const b = norm(base);
  if (steps <= 1) return [b];
  const out: string[] = [];
  for (let i = 0; i < steps; i++) {
    const p = i / (steps - 1);
    out.push(p < 0.5 ? mix("#ffffff", b, p * 2) : mix(b, "#000000", (p - 0.5) * 2));
  }
  return out;
}

/* --------------------------------- harmonies --------------------------------- */

/** `[base, complement]` — the colour opposite on the wheel (180°). */
export const complementary = (base: RGBA | string): string[] => [norm(base), rotate(base, 180)];

/** `count` colours spaced `angle`° apart around `base` (base centred). */
export function analogous(base: RGBA | string, angle = 30, count = 3): string[] {
  const out: string[] = [];
  const start = -Math.floor(count / 2);
  for (let i = 0; i < count; i++) out.push(rotate(base, (start + i) * angle));
  return out;
}

/** `[base, +120°, +240°]`. */
export const triadic = (base: RGBA | string): string[] => [norm(base), rotate(base, 120), rotate(base, 240)];

/** `[base, +90°, +180°, +270°]` (square). */
export const tetradic = (base: RGBA | string): string[] => [norm(base), rotate(base, 90), rotate(base, 180), rotate(base, 270)];

/** `[base, 180−angle, 180+angle]`. */
export const splitComplementary = (base: RGBA | string, angle = 30): string[] => [norm(base), rotate(base, 180 - angle), rotate(base, 180 + angle)];

export type HarmonyType = "complementary" | "analogous" | "triadic" | "tetradic" | "split-complementary";

/** Generate a named harmony set from `base`. */
export function harmony(base: RGBA | string, type: HarmonyType): string[] {
  switch (type) {
    case "complementary": return complementary(base);
    case "analogous": return analogous(base);
    case "triadic": return triadic(base);
    case "tetradic": return tetradic(base);
    case "split-complementary": return splitComplementary(base);
  }
}
