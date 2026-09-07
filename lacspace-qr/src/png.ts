/**
 * A minimal, hand-written PNG encoder (colour type 6, 8-bit RGBA) built on
 * `node:zlib` for the DEFLATE stream — the same trick lacspace-icon uses. Used
 * to rasterise a QR code at a configurable scale with custom colours. Zero
 * third-party dependencies.
 */
import { deflateSync } from "node:zlib";
import type { QrCode } from "./matrix.js";
import { parseColor } from "./color.js";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

// CRC32 with the PNG polynomial (0xEDB88320).
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC32 of a byte range, as an unsigned 32-bit integer. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** A straight (non-premultiplied) RGBA raster. */
export interface ImageData {
  width: number;
  height: number;
  /** Row-major RGBA, length = width * height * 4. */
  rgba: Uint8Array;
}

/** Encode a straight RGBA raster as an 8-bit RGBA (colour type 6) PNG. */
export function encodePng(img: ImageData): Uint8Array {
  const { width, height, rgba } = img;
  if (rgba.length !== width * height * 4) throw new Error("encodePng: rgba length mismatch");
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const compressed = new Uint8Array(deflateSync(raw, { level: 9 }));

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [PNG_SIGNATURE, writeChunk("IHDR", ihdr), writeChunk("IDAT", compressed), writeChunk("IEND", new Uint8Array(0))];
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** True if the bytes start with the PNG signature. */
export function isPng(bytes: Uint8Array): boolean {
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

export interface PngOptions {
  /** Pixels per module (default 10). */
  scale?: number;
  /** Quiet-zone margin in modules (default 4). */
  margin?: number;
  /** Foreground (dark module) colour (default #000000). */
  fg?: string;
  /** Background colour (default #ffffff; transparent supported). */
  bg?: string;
}

/** Rasterise a QR code into an RGBA image. */
export function renderToImage(qr: QrCode, opts: PngOptions = {}): ImageData {
  const scale = Math.max(1, Math.floor(opts.scale ?? 10));
  const margin = opts.margin ?? 4;
  const fg = parseColor(opts.fg ?? "#000000");
  const bg = parseColor(opts.bg ?? "#ffffff");
  const dim = (qr.size + margin * 2) * scale;
  const rgba = new Uint8Array(dim * dim * 4);

  for (let py = 0; py < dim; py++) {
    const my = Math.floor(py / scale) - margin;
    for (let px = 0; px < dim; px++) {
      const mx = Math.floor(px / scale) - margin;
      const isDark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my]![mx];
      const c = isDark ? fg : bg;
      const o = (py * dim + px) * 4;
      rgba[o] = c.r;
      rgba[o + 1] = c.g;
      rgba[o + 2] = c.b;
      rgba[o + 3] = c.a;
    }
  }
  return { width: dim, height: dim, rgba };
}

/** Render a QR code straight to PNG bytes. */
export function renderToPng(qr: QrCode, opts: PngOptions = {}): Uint8Array {
  return encodePng(renderToImage(qr, opts));
}
