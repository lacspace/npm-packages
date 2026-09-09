/**
 * Surface — a zero-dependency RGBA pixel buffer with a small, deterministic
 * drawing API (fills, gradients, patterns, image placement, resize, crop).
 * Works identically in Node and the browser; nothing here touches the DOM.
 */

import type {
  Color,
  DrawImageOptions,
  LinearGradientOptions,
  PatternOptions,
  PatternKind,
  PixelSource,
  RadialGradientOptions,
} from "./types.js";
import { parseColor, blendOver, mix, type RGBA } from "./color.js";

function sortStops(stops: { offset: number; color: Color }[]) {
  return stops
    .map((s) => ({ offset: Math.max(0, Math.min(1, s.offset)), rgba: parseColor(s.color) }))
    .sort((a, b) => a.offset - b.offset);
}

function sampleStops(stops: { offset: number; rgba: RGBA }[], t: number): RGBA {
  if (stops.length === 0) return [0, 0, 0, 0];
  if (t <= stops[0]!.offset) return stops[0]!.rgba;
  const last = stops[stops.length - 1]!;
  if (t >= last.offset) return last.rgba;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (t <= b.offset) {
      const span = b.offset - a.offset || 1;
      return mix(a.rgba, b.rgba, (t - a.offset) / span);
    }
  }
  return last.rgba;
}

/** A small mulberry32 PRNG so `noise` is deterministic across runs and platforms. */
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

export class Surface implements PixelSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.data = data ?? new Uint8ClampedArray(this.width * this.height * 4);
  }

  /** Wrap an existing RGBA source (e.g. a Canvas ImageData) without copying. */
  static from(src: PixelSource): Surface {
    return new Surface(src.width, src.height, src.data);
  }

  private idx(x: number, y: number) {
    return (y * this.width + x) * 4;
  }

  private set(x: number, y: number, c: RGBA) {
    const i = this.idx(x, y);
    const d = this.data;
    if (c[3] === 255) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    } else {
      const dst: RGBA = [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
      const out = blendOver(dst, c);
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = out[3];
    }
  }

  /** Paint the whole surface a solid colour (replaces, does not blend). */
  fill(color: Color): this {
    const [r, g, b, a] = parseColor(color);
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
    return this;
  }

  /** Blend a rectangle of colour over the surface. */
  rect(x: number, y: number, w: number, h: number, color: Color): this {
    const c = parseColor(color);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.set(px, py, c);
    return this;
  }

  linearGradient(opts: LinearGradientOptions): this {
    const stops = sortStops(opts.stops);
    const angle = ((opts.angle ?? 0) * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const w = this.width;
    const h = this.height;
    // Projected extent of the box corners onto the axis, to normalise t to 0..1.
    const projs = [0, w * dx, h * dy, w * dx + h * dy];
    const min = Math.min(...projs);
    const span = Math.max(...projs) - min || 1;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const t = ((px + 0.5) * dx + (py + 0.5) * dy - min) / span;
        this.set(px, py, sampleStops(stops, t));
      }
    }
    return this;
  }

  radialGradient(opts: RadialGradientOptions): this {
    const stops = sortStops(opts.stops);
    const w = this.width;
    const h = this.height;
    const cx = (opts.cx ?? 0.5) * w;
    const cy = (opts.cy ?? 0.5) * h;
    const radius = (opts.radius ?? 0.75) * Math.max(w, h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const t = Math.sqrt(dx * dx + dy * dy) / (radius || 1);
        this.set(px, py, sampleStops(stops, t));
      }
    }
    return this;
  }

  pattern(kind: PatternKind, opts: PatternOptions = {}): this {
    const size = Math.max(1, opts.size ?? 24);
    const color = parseColor(opts.color ?? "rgba(255,255,255,0.13)");
    const w = this.width;
    const h = this.height;
    if (kind === "noise") {
      const rand = rng(opts.seed ?? 1);
      const strength = opts.strength ?? 0.06;
      const d = this.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (rand() - 0.5) * 2 * strength * 255;
        d[i] = d[i]! + n;
        d[i + 1] = d[i + 1]! + n;
        d[i + 2] = d[i + 2]! + n;
      }
      return this;
    }
    if (kind === "dots") {
      const r = Math.max(1, size / 6);
      for (let cy = size / 2; cy < h; cy += size)
        for (let cx = size / 2; cx < w; cx += size)
          for (let py = -r; py <= r; py++)
            for (let px = -r; px <= r; px++)
              if (px * px + py * py <= r * r) this.set(Math.round(cx + px), Math.round(cy + py), color);
      return this;
    }
    if (kind === "grid") {
      for (let x = 0; x < w; x += size) this.rect(x, 0, 1, h, opts.color ?? "rgba(255,255,255,0.13)");
      for (let y = 0; y < h; y += size) this.rect(0, y, w, 1, opts.color ?? "rgba(255,255,255,0.13)");
      return this;
    }
    if (kind === "stripes") {
      const angle = opts.angle ?? 45;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          let coord: number;
          if (angle === 0) coord = px;
          else if (angle === 90) coord = py;
          else coord = px + py;
          if (Math.floor(coord / size) % 2 === 0) this.set(px, py, color);
        }
      }
      return this;
    }
    // checker
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const on = (Math.floor(px / size) + Math.floor(py / size)) % 2 === 0;
        if (on) this.set(px, py, color);
      }
    }
    return this;
  }

  /** Bilinear sample of a source at fractional (u,v) in source pixel space. */
  private static sampleBilinear(src: PixelSource, u: number, v: number): RGBA {
    const x = Math.max(0, Math.min(src.width - 1, u));
    const y = Math.max(0, Math.min(src.height - 1, v));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(src.width - 1, x0 + 1);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const at = (px: number, py: number): RGBA => {
      const i = (py * src.width + px) * 4;
      return [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!, src.data[i + 3]!];
    };
    const top = mix(at(x0, y0), at(x1, y0), fx);
    const bot = mix(at(x0, y1), at(x1, y1), fx);
    return mix(top, bot, fy);
  }

  /** Place another image/surface onto this one, with fit + resampling. */
  drawImage(src: PixelSource, o: DrawImageOptions = {}): this {
    const dx = o.x ?? 0;
    const dy = o.y ?? 0;
    const dw = o.width ?? src.width;
    const dh = o.height ?? src.height;
    const fit = o.fit ?? "cover";
    const nearest = o.resample === "nearest";

    // Map a destination pixel back to a source coordinate honouring `fit`.
    let scaleX = src.width / dw;
    let scaleY = src.height / dh;
    let offU = 0;
    let offV = 0;
    if (fit === "cover" || fit === "contain") {
      const s = fit === "cover" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
      scaleX = scaleY = s;
      offU = (src.width - dw * s) / 2;
      offV = (src.height - dh * s) / 2;
    }
    const x0 = Math.max(0, Math.floor(dx));
    const y0 = Math.max(0, Math.floor(dy));
    const x1 = Math.min(this.width, Math.floor(dx + dw));
    const y1 = Math.min(this.height, Math.floor(dy + dh));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const u = (px - dx) * scaleX + offU;
        const v = (py - dy) * scaleY + offV;
        if (fit === "contain" && (u < 0 || v < 0 || u >= src.width || v >= src.height)) continue;
        const c = nearest
          ? (() => {
              const i = (Math.min(src.height - 1, Math.max(0, Math.round(v))) * src.width +
                Math.min(src.width - 1, Math.max(0, Math.round(u)))) * 4;
              return [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!, src.data[i + 3]!] as RGBA;
            })()
          : Surface.sampleBilinear(src, u, v);
        this.set(px, py, c);
      }
    }
    return this;
  }

  /** Return a NEW surface resampled to the given dimensions (bilinear). */
  resize(width: number, height: number): Surface {
    const out = new Surface(width, height);
    const sx = this.width / out.width;
    const sy = this.height / out.height;
    for (let py = 0; py < out.height; py++) {
      for (let px = 0; px < out.width; px++) {
        const c = Surface.sampleBilinear(this, (px + 0.5) * sx - 0.5, (py + 0.5) * sy - 0.5);
        const i = (py * out.width + px) * 4;
        out.data[i] = c[0];
        out.data[i + 1] = c[1];
        out.data[i + 2] = c[2];
        out.data[i + 3] = c[3];
      }
    }
    return out;
  }

  /** Return a NEW surface cropped to the given rectangle. */
  crop(x: number, y: number, w: number, h: number): Surface {
    const out = new Surface(w, h);
    for (let py = 0; py < out.height; py++) {
      for (let px = 0; px < out.width; px++) {
        const srcX = Math.min(this.width - 1, Math.max(0, x + px));
        const srcY = Math.min(this.height - 1, Math.max(0, y + py));
        const si = (srcY * this.width + srcX) * 4;
        const di = (py * out.width + px) * 4;
        out.data[di] = this.data[si]!;
        out.data[di + 1] = this.data[si + 1]!;
        out.data[di + 2] = this.data[si + 2]!;
        out.data[di + 3] = this.data[si + 3]!;
      }
    }
    return out;
  }

  /** Flatten transparency onto a solid background, returning a NEW opaque surface. */
  flatten(background: Color = "#ffffff"): Surface {
    const bg = parseColor(background);
    const out = new Surface(this.width, this.height);
    for (let i = 0; i < this.data.length; i += 4) {
      const src: RGBA = [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
      const c = blendOver([bg[0], bg[1], bg[2], 255], src);
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
      out.data[i + 3] = 255;
    }
    return out;
  }

  /**
   * Return a NEW surface with each channel reduced to `bits` bits (2..8).
   * Fewer distinct values compress far better as lossless PNG — the main lever
   * for hitting a PNG size budget on noisy/photographic content.
   */
  posterize(bits: number): Surface {
    const b = Math.max(1, Math.min(8, Math.floor(bits)));
    if (b >= 8) return this.clone();
    const levels = (1 << b) - 1;
    const out = new Surface(this.width, this.height, new Uint8ClampedArray(this.data));
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round((Math.round((d[i]! / 255) * levels) / levels) * 255);
      d[i + 1] = Math.round((Math.round((d[i + 1]! / 255) * levels) / levels) * 255);
      d[i + 2] = Math.round((Math.round((d[i + 2]! / 255) * levels) / levels) * 255);
      // alpha left intact
    }
    return out;
  }

  clone(): Surface {
    return new Surface(this.width, this.height, new Uint8ClampedArray(this.data));
  }
}

/** Convenience: a new surface pre-filled with a linear gradient. */
export function gradient(width: number, height: number, opts: LinearGradientOptions): Surface {
  return new Surface(width, height).linearGradient(opts);
}

/** Convenience: a new surface pre-filled with a radial gradient. */
export function radial(width: number, height: number, opts: RadialGradientOptions): Surface {
  return new Surface(width, height).radialGradient(opts);
}

/** Convenience: a solid surface with a pattern painted over it. */
export function pattern(
  width: number,
  height: number,
  base: Color,
  kind: PatternKind,
  opts?: PatternOptions,
): Surface {
  return new Surface(width, height).fill(base).pattern(kind, opts);
}
