/**
 * Deterministic, no-AI image generators built on Surface:
 *  - identicon(): a symmetric avatar from any string (GitHub-style)
 *  - mesh():      a smooth multi-point mesh gradient
 *  - placeholder(): a tasteful gradient placeholder / LQIP from a seed
 * All are seeded, so the same input always yields the same image.
 */
import { Surface } from "./surface.js";
import { parseColor, mix, type RGBA } from "./color.js";
import type { Color } from "./types.js";

function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hsl(h: number, s: number, l: number): RGBA {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), 255];
}

export interface IdenticonOptions {
  size?: number;
  /** Odd number of cells across (default 5). */
  grid?: number;
  background?: Color;
  /** Force the foreground colour; default derived from the seed. */
  color?: Color;
  /** Cell padding fraction (default 0.12 of the size). */
  padding?: number;
}

/** A symmetric identicon avatar from any string. */
export function identicon(seed: string, opts: IdenticonOptions = {}): Surface {
  const size = opts.size ?? 240;
  const grid = Math.max(3, (opts.grid ?? 5) | 1); // force odd
  const h = hash32(seed);
  const rand = rng(h);
  const fgRgba = hsl(h % 360, 0.62, 0.58);
  const fg = opts.color ?? `rgb(${fgRgba[0]},${fgRgba[1]},${fgRgba[2]})`;
  const s = new Surface(size, size).fill(opts.background ?? "#0f1117");
  const pad = Math.round(size * (opts.padding ?? 0.12));
  const cell = (size - pad * 2) / grid;
  const half = Math.ceil(grid / 2);
  for (let col = 0; col < half; col++) {
    for (let row = 0; row < grid; row++) {
      if (rand() > 0.5) {
        const mirror = grid - 1 - col;
        const y = pad + row * cell;
        s.rect(pad + col * cell, y, Math.ceil(cell), Math.ceil(cell), fg);
        if (mirror !== col) s.rect(pad + mirror * cell, y, Math.ceil(cell), Math.ceil(cell), fg);
      }
    }
  }
  return s;
}

export interface MeshOptions {
  colors?: Color[];
  /** Number of colour points (default = colors.length or 5). */
  points?: number;
  seed?: string | number;
}

const DEFAULT_MESH = ["#0BB9D9", "#3B82F6", "#7C3AED", "#EC4899", "#22D3EE"];

/** A smooth multi-point mesh gradient (inverse-distance blend of seeded points). */
export function mesh(width: number, height: number, opts: MeshOptions = {}): Surface {
  const palette = (opts.colors ?? DEFAULT_MESH).map(parseColor);
  const n = Math.max(2, opts.points ?? palette.length);
  const seed = typeof opts.seed === "number" ? opts.seed : hash32(String(opts.seed ?? "mesh"));
  const rand = rng(seed);
  const pts = Array.from({ length: n }, (_, i) => ({
    x: rand() * width,
    y: rand() * height,
    c: palette[i % palette.length]!,
  }));
  const out = new Surface(width, height);
  const d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let wr = 0, wg = 0, wb = 0, wsum = 0;
      for (const p of pts) {
        const dx = x - p.x;
        const dy = y - p.y;
        const w = 1 / (dx * dx + dy * dy + 800); // +epsilon for smoothness
        wr += p.c[0] * w;
        wg += p.c[1] * w;
        wb += p.c[2] * w;
        wsum += w;
      }
      const i = (y * width + x) * 4;
      d[i] = wr / wsum;
      d[i + 1] = wg / wsum;
      d[i + 2] = wb / wsum;
      d[i + 3] = 255;
    }
  }
  return out;
}

export interface PlaceholderOptions {
  seed?: string | number;
  /** Force the two gradient endpoints instead of deriving from the seed. */
  colors?: [Color, Color];
  /** Add a faint dot grid over the gradient (default true). */
  texture?: boolean;
}

/** A tasteful, seeded gradient placeholder (great as an LQIP or empty state). */
export function placeholder(width: number, height: number, opts: PlaceholderOptions = {}): Surface {
  const seed = typeof opts.seed === "number" ? opts.seed : hash32(String(opts.seed ?? `${width}x${height}`));
  const rand = rng(seed);
  let from: RGBA, to: RGBA;
  if (opts.colors) {
    [from, to] = [parseColor(opts.colors[0]), parseColor(opts.colors[1])];
  } else {
    const base = Math.floor(rand() * 360);
    from = hsl(base, 0.55, 0.55);
    to = hsl(base + 40 + rand() * 60, 0.55, 0.45);
  }
  const angle = Math.floor(rand() * 180);
  const s = new Surface(width, height).linearGradient({
    angle,
    stops: [
      { offset: 0, color: `rgb(${from[0]},${from[1]},${from[2]})` },
      { offset: 1, color: `rgb(${to[0]},${to[1]},${to[2]})` },
    ],
  });
  if (opts.texture !== false) s.pattern("dots", { size: Math.max(20, Math.round(width / 24)), color: "rgba(255,255,255,0.08)" });
  return s;
}

// re-export mix for parity/testing convenience
export { mix };
