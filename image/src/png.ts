/**
 * Minimal, dependency-free PNG encoder (8-bit RGBA, non-interlaced).
 * Compression: `node:zlib` when running in Node (kept external in browser
 * bundles), otherwise a valid *stored* (uncompressed) DEFLATE stream — so the
 * output is always a spec-correct PNG everywhere, just larger without zlib.
 * In the browser the orchestrator prefers Canvas, which compresses properly.
 */

import type { PixelSource } from "./types.js";

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

/** A valid zlib stream using only *stored* DEFLATE blocks (no compression). */
function storedZlib(data: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks: Uint8Array[] = [];
  let offset = 0;
  if (data.length === 0) {
    blocks.push(new Uint8Array([1, 0, 0, 0xff, 0xff]));
  }
  while (offset < data.length) {
    const len = Math.min(MAX, data.length - offset);
    const final = offset + len >= data.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = final;
    header[1] = len & 255;
    header[2] = (len >>> 8) & 255;
    header[3] = ~len & 255;
    header[4] = (~len >>> 8) & 255;
    blocks.push(header, data.subarray(offset, offset + len));
    offset += len;
  }
  const bodyLen = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(2 + bodyLen + 4);
  out[0] = 0x78; // CMF
  out[1] = 0x01; // FLG
  let p = 2;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  out.set(u32(adler32(data)), p);
  return out;
}

function isNode(): boolean {
  return typeof process !== "undefined" && !!(process as { versions?: { node?: string } }).versions?.node;
}

async function deflate(data: Uint8Array, level: number): Promise<Uint8Array> {
  if (isNode()) {
    try {
      const z = await import(/* @vite-ignore */ "node:zlib");
      return new Uint8Array((z.deflateSync as (b: Uint8Array, o?: object) => Buffer)(data, { level }));
    } catch {
      /* fall through to stored */
    }
  }
  return storedZlib(data);
}

/** Prepend a "None" filter byte (0) to every scanline. */
function filterScanlines(src: PixelSource): Uint8Array {
  const { width, height, data } = src;
  const rowBytes = width * 4;
  const out = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (rowBytes + 1);
    out[o] = 0;
    out.set(data.subarray(y * rowBytes, y * rowBytes + rowBytes), o + 1);
  }
  return out;
}

function assemble(source: PixelSource, idat: Uint8Array): Uint8Array {
  const ihdrData = new Uint8Array(13);
  ihdrData.set(u32(source.width), 0);
  ihdrData.set(u32(source.height), 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // colour type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);
  const idatChunk = chunk("IDAT", idat);
  const iend = chunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(SIGNATURE.length + ihdr.length + idatChunk.length + iend.length);
  let p = 0;
  for (const part of [SIGNATURE, ihdr, idatChunk, iend]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** Encode an RGBA source to PNG bytes. `level` 0..9 (zlib), default 9. */
export async function encodePng(source: PixelSource, level = 9): Promise<Uint8Array> {
  const idat = await deflate(filterScanlines(source), level);
  return assemble(source, idat);
}

/** Synchronous PNG using the pure stored-deflate path (valid, uncompressed). */
export function encodePngSync(source: PixelSource): Uint8Array {
  return assemble(source, storedZlib(filterScanlines(source)));
}
