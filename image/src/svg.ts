/**
 * SVG → raster. In the browser we draw the SVG onto a canvas (zero-dep). In
 * Node, rich SVG text/paths need a real renderer, so we use an OPTIONAL peer
 * (`sharp`) if it's installed — otherwise we throw a clear, actionable error.
 * This keeps the package itself zero-dependency while still enabling server-side
 * raster for teams that opt in.
 */

import { Surface } from "./surface.js";
import type { Color } from "./types.js";

export interface RasterizeSvgOptions {
  width?: number;
  height?: number;
  /** Painted under the SVG (SVGs are transparent by default). */
  background?: Color;
}

async function svgToSurfaceBrowser(svg: string, opts: RasterizeSvgOptions): Promise<Surface> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to load SVG"));
      el.src = url;
    });
    const w = opts.width ?? img.naturalWidth ?? 512;
    const h = opts.height ?? img.naturalHeight ?? 512;
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext("2d");
    if (!ctx) throw new Error("No 2D context for SVG rasterization");
    if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return new Surface(w, h, data.data);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function svgToSurfaceNode(svg: string, opts: RasterizeSvgOptions): Promise<Surface> {
  let sharp: undefined | ((input: Buffer) => SharpLike);
  try {
    // @ts-ignore optional peer dependency — may not be installed
    const mod = (await import("sharp")) as unknown as { default: (input: Buffer) => SharpLike };
    sharp = mod.default;
  } catch {
    throw new Error(
      "SVG rasterization in Node requires the optional peer `sharp`. Install it (npm i sharp) " +
        "or run rasterizeSvg() in the browser, where it uses the native Canvas with no extra deps.",
    );
  }
  let pipe = sharp(Buffer.from(svg));
  if (opts.width || opts.height) pipe = pipe.resize(opts.width, opts.height, { fit: "fill" });
  if (opts.background) pipe = pipe.flatten({ background: opts.background });
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return new Surface(info.width, info.height, new Uint8ClampedArray(data));
}

interface SharpLike {
  resize(w?: number, h?: number, o?: { fit?: string }): SharpLike;
  flatten(o: { background?: string }): SharpLike;
  ensureAlpha(): SharpLike;
  raw(): SharpLike;
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>;
}

/** Rasterize an SVG string to a Surface (browser: Canvas; Node: optional `sharp`). */
export async function rasterizeSvg(svg: string, opts: RasterizeSvgOptions = {}): Promise<Surface> {
  const isNode = typeof process !== "undefined" && !!(process as { versions?: { node?: string } }).versions?.node;
  if (!isNode && typeof Image !== "undefined") return svgToSurfaceBrowser(svg, opts);
  return svgToSurfaceNode(svg, opts);
}
