/**
 * Unified, isomorphic encode(): pick the best available encoder for the format
 * and runtime. Browser/Worker → native Canvas (all formats). Node → pure-JS PNG
 * (zlib) and JPEG; WebP needs a Canvas runtime.
 */

import { hasCanvas, encodeViaCanvas } from "./env.js";
import { encodePng } from "./png.js";
import { encodeJpeg } from "./jpeg.js";
import { Surface } from "./surface.js";
import type { EncodeOptions, EncodeResult, PixelSource } from "./types.js";

function hasAlpha(src: PixelSource): boolean {
  const d = src.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]! < 255) return true;
  return false;
}

/** Encode an RGBA source to the requested format. */
export async function encode(source: PixelSource, opts: EncodeOptions): Promise<EncodeResult> {
  const format = opts.format;
  const quality = opts.quality ?? 82;
  let bytes: Uint8Array;

  if (format === "jpeg") {
    const flat = hasAlpha(source) ? Surface.from(source).flatten(opts.background ?? "#ffffff") : source;
    if (hasCanvas()) {
      try {
        bytes = await encodeViaCanvas(flat, "jpeg", quality);
      } catch {
        bytes = encodeJpeg(flat, quality);
      }
    } else {
      bytes = encodeJpeg(flat, quality);
    }
  } else if (format === "png") {
    if (hasCanvas()) {
      try {
        bytes = await encodeViaCanvas(source, "png");
      } catch {
        bytes = await encodePng(source);
      }
    } else {
      bytes = await encodePng(source);
    }
  } else if (format === "webp") {
    if (!hasCanvas()) {
      throw new Error(
        "WebP encoding needs a Canvas runtime (browser or a Worker with OffscreenCanvas). " +
          "In Node, export png or jpeg instead.",
      );
    }
    bytes = await encodeViaCanvas(source, "webp", quality);
  } else {
    throw new Error(`Unsupported format: ${String(format)}`);
  }

  return {
    bytes,
    format,
    width: source.width,
    height: source.height,
    quality: format === "png" ? undefined : quality,
    size: bytes.length,
  };
}
