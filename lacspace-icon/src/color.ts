/**
 * Dominant-colour extraction. Used to pick a sensible manifest `theme_color`
 * and Open-Graph background straight from the logo, so the icon set feels
 * on-brand without the user hand-picking a hex value.
 */
import type { ImageData } from "./png.js";

/** Format an [r,g,b] triple as a lowercase `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Extract the dominant colour of an image as a `#rrggbb` hex string.
 *
 * Pixels are binned into a coarse 5-bit-per-channel histogram (weighted by
 * alpha so transparent regions don't count). Near-transparent pixels are
 * skipped. To avoid returning a dull grey when a logo has one strong accent,
 * saturated buckets are given extra weight. The winning bucket's true mean
 * colour is returned (not the quantized centre), so the result is accurate.
 *
 * @param input a decoded image, or a raw straight-RGBA byte array.
 */
export function dominantColor(input: ImageData | Uint8Array): string {
  const rgba = input instanceof Uint8Array ? input : input.rgba;
  const buckets = new Map<number, { r: number; g: number; b: number; w: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a < 24) continue; // skip (near-)transparent pixels
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // Alpha weight, boosted by saturation so an accent colour beats the field.
    const w = (a / 255) * (0.35 + sat);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { r: 0, g: 0, b: 0, w: 0 };
      buckets.set(key, bucket);
    }
    bucket.r += r * w;
    bucket.g += g * w;
    bucket.b += b * w;
    bucket.w += w;
  }
  let best: { r: number; g: number; b: number; w: number } | undefined;
  for (const bucket of buckets.values()) {
    if (!best || bucket.w > best.w) best = bucket;
  }
  if (!best || best.w <= 0) return "#4d9fff";
  return rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w);
}
