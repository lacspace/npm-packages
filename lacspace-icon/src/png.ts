/**
 * A compact, zero-dependency PNG codec. It decodes 8-bit PNGs (colour types
 * 0/2/3/6, plus 4) to straight RGBA and encodes straight RGBA back to an 8-bit
 * RGBA PNG. Compression is handled by `node:zlib` (the same trick the
 * lacspace-extract PDF engine uses for FlateDecode streams). Interlaced and
 * <8-bit images are rejected with a clear error.
 */
import { inflateSync, deflateSync } from "node:zlib";

/** A straight (non-premultiplied) RGBA raster. */
export interface ImageData {
  width: number;
  height: number;
  /** Row-major RGBA, length = width * height * 4. */
  rgba: Uint8Array;
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC32 (PNG polynomial 0xEDB88320) ----------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC32 of a byte range, as an unsigned 32-bit integer. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a PNG into straight RGBA. Supports 8-bit colour types 0 (grayscale),
 * 2 (RGB), 3 (palette, with optional tRNS), 4 (grayscale+alpha) and 6 (RGBA).
 */
export function decodePng(bytes: Uint8Array): ImageData {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG file (bad signature).");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  let trns: Uint8Array | undefined;
  const idat: Uint8Array[] = [];

  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = readU32(bytes, pos);
    const type = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!);
    const dataStart = pos + 8;
    const data = bytes.subarray(dataStart, dataStart + len);
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "PLTE") {
      palette = data.slice();
    } else if (type === "tRNS") {
      trns = data.slice();
    } else if (type === "IDAT") {
      idat.push(data.slice());
    } else if (type === "IEND") {
      break;
    }
    pos = dataStart + len + 4; // skip data + CRC
  }

  if (width <= 0 || height <= 0) throw new Error("PNG has no valid IHDR.");
  if (interlace !== 0) throw new Error("Interlaced PNGs are not supported.");
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth} (only 8-bit is supported).`);
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`);
  if (colorType === 3 && !palette) throw new Error("Palette PNG is missing its PLTE chunk.");

  // Concatenate + inflate IDAT.
  let totalLen = 0;
  for (const c of idat) totalLen += c.length;
  const compressed = new Uint8Array(totalLen);
  {
    let off = 0;
    for (const c of idat) {
      compressed.set(c, off);
      off += c.length;
    }
  }
  const raw = new Uint8Array(inflateSync(compressed));

  // Reverse the scanline filters.
  const bpp = channels; // bytes per pixel at 8-bit
  const stride = width * bpp;
  const expected = height * (stride + 1);
  if (raw.length < expected) throw new Error("PNG data is truncated.");
  const unfiltered = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]!;
    const row = y * stride;
    const prev = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const rawByte = raw[src + i]!;
      const a = i >= bpp ? unfiltered[row + i - bpp]! : 0;
      const b = y > 0 ? unfiltered[prev + i]! : 0;
      const c = y > 0 && i >= bpp ? unfiltered[prev + i - bpp]! : 0;
      let val: number;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + paeth(a, b, c); break;
        default: throw new Error(`Unknown PNG filter type ${filter}.`);
      }
      unfiltered[row + i] = val & 0xff;
    }
    src += stride;
  }

  // Expand to straight RGBA.
  const rgba = new Uint8Array(width * height * 4);
  const px = width * height;
  if (colorType === 6) {
    rgba.set(unfiltered);
  } else if (colorType === 2) {
    for (let p = 0; p < px; p++) {
      rgba[p * 4] = unfiltered[p * 3]!;
      rgba[p * 4 + 1] = unfiltered[p * 3 + 1]!;
      rgba[p * 4 + 2] = unfiltered[p * 3 + 2]!;
      rgba[p * 4 + 3] = 255;
    }
  } else if (colorType === 0) {
    for (let p = 0; p < px; p++) {
      const g = unfiltered[p]!;
      rgba[p * 4] = g;
      rgba[p * 4 + 1] = g;
      rgba[p * 4 + 2] = g;
      rgba[p * 4 + 3] = 255;
    }
  } else if (colorType === 4) {
    for (let p = 0; p < px; p++) {
      const g = unfiltered[p * 2]!;
      rgba[p * 4] = g;
      rgba[p * 4 + 1] = g;
      rgba[p * 4 + 2] = g;
      rgba[p * 4 + 3] = unfiltered[p * 2 + 1]!;
    }
  } else if (colorType === 3) {
    const pal = palette!;
    for (let p = 0; p < px; p++) {
      const idx = unfiltered[p]!;
      rgba[p * 4] = pal[idx * 3] ?? 0;
      rgba[p * 4 + 1] = pal[idx * 3 + 1] ?? 0;
      rgba[p * 4 + 2] = pal[idx * 3 + 2] ?? 0;
      rgba[p * 4 + 3] = trns && idx < trns.length ? trns[idx]! : 255;
    }
  }

  return { width, height, rgba };
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc);
  return chunk;
}

/** Encode a straight RGBA raster as an 8-bit RGBA (colour type 6) PNG. */
export function encodePng(img: ImageData): Uint8Array {
  const { width, height, rgba } = img;
  if (rgba.length !== width * height * 4) {
    throw new Error("encodePng: rgba length does not match width * height * 4.");
  }
  // Prefix every scanline with filter byte 0 (None).
  const stride = width * 4;
  const rawData = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (stride + 1)] = 0;
    rawData.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const compressed = new Uint8Array(deflateSync(rawData, { level: 9 }));

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [
    PNG_SIGNATURE,
    writeChunk("IHDR", ihdr),
    writeChunk("IDAT", compressed),
    writeChunk("IEND", new Uint8Array(0)),
  ];
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
