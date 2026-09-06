/**
 * Small compositing helpers: parse a hex colour, make a solid-colour canvas,
 * and alpha-over a resized icon onto it at an offset. Used to build the
 * apple-touch, maskable and Open Graph images.
 */
import type { ImageData } from "./png.js";
import { resizeRgba } from "./resize.js";

/** Parse `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` into an [r,g,b,a] tuple. */
export function hexToRgba(hex: string): [number, number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map((c) => c + c).join("");
  }
  if (h.length !== 6 && h.length !== 8) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) throw new Error(`Invalid hex colour: "${hex}"`);
  return [r, g, b, a];
}

/** Create a `w`×`h` canvas filled with a solid colour (default transparent). */
export function createCanvas(w: number, h: number, bg?: string): ImageData {
  const rgba = new Uint8Array(w * h * 4);
  if (bg) {
    const [r, g, b, a] = hexToRgba(bg);
    for (let p = 0; p < w * h; p++) {
      rgba[p * 4] = r;
      rgba[p * 4 + 1] = g;
      rgba[p * 4 + 2] = b;
      rgba[p * 4 + 3] = a;
    }
  }
  return { width: w, height: h, rgba };
}

/**
 * Alpha-over composite `src` onto `dst` (mutated in place) at pixel offset
 * (`ox`, `oy`). Standard "source-over" Porter-Duff blend.
 */
export function compositeOver(dst: ImageData, src: ImageData, ox: number, oy: number): void {
  const { width: dw, height: dh, rgba: d } = dst;
  const { width: sw, height: sh, rgba: s } = src;
  for (let y = 0; y < sh; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= dw) continue;
      const sp = (y * sw + x) * 4;
      const sa = s[sp + 3]! / 255;
      if (sa <= 0) continue;
      const dp = (ty * dw + tx) * 4;
      const da = d[dp + 3]! / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 0) {
        d[dp] = 0; d[dp + 1] = 0; d[dp + 2] = 0; d[dp + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const sv = s[sp + c]!;
        const dv = d[dp + c]!;
        d[dp + c] = Math.round((sv * sa + dv * da * (1 - sa)) / outA);
      }
      d[dp + 3] = Math.round(outA * 255);
    }
  }
}

/**
 * Draw `icon` onto a fresh `w`×`h` canvas: fill with `bg`, then place the icon
 * resized to `iconSize` centred (or at an explicit offset). Returns a new image.
 */
export function drawIconOnCanvas(
  icon: ImageData,
  w: number,
  h: number,
  iconSize: number,
  bg?: string,
  offset?: { x: number; y: number },
): ImageData {
  const canvas = createCanvas(w, h, bg);
  const resized: ImageData = { width: iconSize, height: iconSize, rgba: resizeRgba(icon, iconSize, iconSize) };
  const ox = offset ? offset.x : Math.round((w - iconSize) / 2);
  const oy = offset ? offset.y : Math.round((h - iconSize) / 2);
  compositeOver(canvas, resized, ox, oy);
  return canvas;
}
