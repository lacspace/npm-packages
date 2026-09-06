import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { decodePng, encodePng, crc32, isPng, type ImageData } from "./png.js";

const SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Build a PNG chunk with a correct CRC (mirrors the encoder). */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Hand-build an 8-bit PNG of a given colour type from raw channel data. */
function buildPng(width: number, height: number, colorType: number, channels: number, pixels: number[], plte?: number[], trns?: number[]): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = pixels[y * stride + i]!;
  }
  const idat = new Uint8Array(deflateSync(raw));
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const parts: Uint8Array[] = [SIG, chunk("IHDR", ihdr)];
  if (plte) parts.push(chunk("PLTE", Uint8Array.from(plte)));
  if (trns) parts.push(chunk("tRNS", Uint8Array.from(trns)));
  parts.push(chunk("IDAT", idat), chunk("IEND", new Uint8Array(0)));
  let total = 0;
  for (const p of parts) total += p.length;
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

describe("crc32", () => {
  it("matches the known IEND CRC", () => {
    // "IEND" with no data → CRC 0xAE426082.
    expect(crc32(Uint8Array.from([0x49, 0x45, 0x4e, 0x44]))).toBe(0xae426082);
  });
});

describe("encodePng / decodePng round-trip", () => {
  it("preserves a 4x4 RGBA buffer with alpha exactly", () => {
    const width = 4, height = 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      rgba[p * 4] = (p * 7) & 0xff;
      rgba[p * 4 + 1] = (p * 13 + 5) & 0xff;
      rgba[p * 4 + 2] = (255 - p * 11) & 0xff;
      rgba[p * 4 + 3] = (p * 17) & 0xff; // varied alpha incl. 0
    }
    const img: ImageData = { width, height, rgba };
    const png = encodePng(img);
    expect(isPng(png)).toBe(true);
    const back = decodePng(png);
    expect(back.width).toBe(width);
    expect(back.height).toBe(height);
    expect(Array.from(back.rgba)).toEqual(Array.from(rgba));
  });

  it("round-trips a non-square image", () => {
    const width = 5, height = 3;
    const rgba = new Uint8Array(width * height * 4).map((_, i) => (i * 3) & 0xff);
    const png = encodePng({ width, height, rgba });
    const back = decodePng(png);
    expect(back.width).toBe(5);
    expect(back.height).toBe(3);
    expect(Array.from(back.rgba)).toEqual(Array.from(rgba));
  });
});

describe("decodePng colour types", () => {
  it("decodes colour type 2 (RGB) as opaque RGBA", () => {
    // 2x1: red, green.
    const png = buildPng(2, 1, 2, 3, [255, 0, 0, 0, 255, 0]);
    const img = decodePng(png);
    expect(img.width).toBe(2);
    expect(Array.from(img.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("decodes colour type 6 (RGBA) built by hand", () => {
    const png = buildPng(1, 2, 6, 4, [10, 20, 30, 40, 50, 60, 70, 80]);
    const img = decodePng(png);
    expect(Array.from(img.rgba)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("decodes colour type 0 (grayscale) to RGBA", () => {
    const png = buildPng(2, 1, 0, 1, [128, 200]);
    const img = decodePng(png);
    expect(Array.from(img.rgba)).toEqual([128, 128, 128, 255, 200, 200, 200, 255]);
  });

  it("decodes colour type 3 (palette) with tRNS", () => {
    // palette: idx0 = red, idx1 = blue; tRNS makes idx0 transparent.
    const png = buildPng(2, 1, 3, 1, [0, 1], [255, 0, 0, 0, 0, 255], [0]);
    const img = decodePng(png);
    expect(Array.from(img.rgba)).toEqual([255, 0, 0, 0, 0, 0, 255, 255]);
  });

  it("rejects a non-PNG buffer", () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/Not a PNG/);
  });
});
