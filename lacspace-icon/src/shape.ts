/**
 * Shape & padding helpers that pre-process the source icon before the set is
 * generated: transparent padding, rounded corners and a circular mask. Each is
 * anti-aliased (fractional edge coverage) and returns a new image — the input
 * is never mutated.
 */
import type { ImageData } from "./png.js";
import { resizeRgba } from "./resize.js";
import { createCanvas, compositeOver } from "./compose.js";

/**
 * Shrink the icon and surround it with margin. `paddingPct` is the percentage
 * of the canvas taken up by margin on **each** side (so 10 leaves the icon at
 * 80% of the width). The margin is `bg` if given, otherwise transparent.
 */
export function pad(img: ImageData, paddingPct: number, bg?: string): ImageData {
  const f = Math.max(0.02, Math.min(1, 1 - (2 * paddingPct) / 100));
  const { width: w, height: h } = img;
  if (f >= 1 && !bg) return { width: w, height: h, rgba: new Uint8Array(img.rgba) };
  const iw = Math.max(1, Math.round(w * f));
  const ih = Math.max(1, Math.round(h * f));
  const canvas = createCanvas(w, h, bg);
  const resized: ImageData = { width: iw, height: ih, rgba: resizeRgba(img, iw, ih) };
  compositeOver(canvas, resized, Math.round((w - iw) / 2), Math.round((h - ih) / 2));
  return canvas;
}

/** Multiply each pixel's alpha by a per-pixel coverage function (0..1). */
function applyAlphaMask(img: ImageData, coverage: (px: number, py: number) => number): ImageData {
  const { width: w, height: h, rgba } = img;
  const out = new Uint8Array(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = coverage(x + 0.5, y + 0.5);
      if (c >= 1) continue;
      const p = (y * w + x) * 4 + 3;
      out[p] = Math.round(out[p]! * (c < 0 ? 0 : c));
    }
  }
  return { width: w, height: h, rgba: out };
}

/**
 * Round the corners of the icon. `radiusPct` is the corner radius as a
 * percentage of the shorter side (0 = square, 50 = fully circular-ish for a
 * square image). Edges are anti-aliased.
 */
export function roundCorners(img: ImageData, radiusPct: number): ImageData {
  const { width: w, height: h } = img;
  const r = Math.max(0, Math.min(50, radiusPct)) / 100 * Math.min(w, h);
  if (r <= 0) return { width: w, height: h, rgba: new Uint8Array(img.rgba) };
  return applyAlphaMask(img, (px, py) => {
    const cx = px < r ? r : px > w - r ? w - r : px;
    const cy = py < r ? r : py > h - r ? h - r : py;
    const dx = px - cx;
    const dy = py - cy;
    if (dx === 0 && dy === 0) return 1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return r + 0.5 - dist; // clamped to 0..1 by applyAlphaMask
  });
}

/** Mask the icon to a centred circle (inscribed in the canvas), anti-aliased. */
export function circleMask(img: ImageData): ImageData {
  const { width: w, height: h } = img;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2;
  return applyAlphaMask(img, (px, py) => {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return radius + 0.5 - dist;
  });
}

/** Invert RGB channels (alpha preserved) — used for the auto dark/light variant. */
export function invert(img: ImageData): ImageData {
  const { width: w, height: h, rgba } = img;
  const out = new Uint8Array(rgba);
  for (let i = 0; i + 3 < out.length; i += 4) {
    out[i] = 255 - out[i]!;
    out[i + 1] = 255 - out[i + 1]!;
    out[i + 2] = 255 - out[i + 2]!;
  }
  return { width: w, height: h, rgba: out };
}
