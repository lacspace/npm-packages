/**
 * Isomorphic canvas layer. When a real Canvas is available (browser main thread,
 * a Worker with OffscreenCanvas), we use it to encode PNG/JPEG/WebP with the
 * platform's own well-tuned encoders. In Node there is no canvas, so callers
 * fall back to the pure-JS PNG/JPEG encoders in this package.
 */

import type { ImageFormat, PixelSource } from "./types.js";

type AnyCanvas = {
  width: number;
  height: number;
  getContext(id: "2d"): CanvasRenderingContext2D | null;
  toBlob?: (cb: (b: Blob | null) => void, type?: string, quality?: number) => void;
  convertToBlob?: (opts?: { type?: string; quality?: number }) => Promise<Blob>;
};

/** Does this runtime expose a usable 2D canvas we can encode from? */
export function hasCanvas(): boolean {
  if (typeof OffscreenCanvas !== "undefined") return true;
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height) as unknown as AnyCanvas;
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return el as unknown as AnyCanvas;
}

const MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function canvasToBytes(canvas: AnyCanvas, format: ImageFormat, quality?: number): Promise<Uint8Array> {
  const type = MIME[format];
  const q = quality != null ? Math.max(0, Math.min(1, quality / 100)) : undefined;
  let blob: Blob | null;
  if (canvas.convertToBlob) {
    blob = await canvas.convertToBlob({ type, quality: q });
  } else if (canvas.toBlob) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob!((b) => res(b), type, q));
  } else {
    throw new Error("Canvas has no toBlob/convertToBlob");
  }
  if (!blob) throw new Error(`Canvas failed to encode ${format}`);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Encode a pixel source via the platform canvas. Throws if no canvas here. */
export async function encodeViaCanvas(source: PixelSource, format: ImageFormat, quality?: number): Promise<Uint8Array> {
  if (!hasCanvas()) throw new Error("No canvas available in this runtime");
  const canvas = makeCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D context");
  const img = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  ctx.putImageData(img, 0, 0);
  return canvasToBytes(canvas, format, quality);
}

/** True where the platform can actually emit this format via canvas. */
export async function canvasSupports(format: ImageFormat): Promise<boolean> {
  if (!hasCanvas()) return false;
  try {
    const test = makeCanvas(2, 2);
    const bytes = await canvasToBytes(test, format, 80);
    // Some browsers silently fall back to PNG for unsupported types.
    if (format === "webp") return bytes[0] !== 0x89; // not a PNG signature
    return bytes.length > 0;
  } catch {
    return false;
  }
}
