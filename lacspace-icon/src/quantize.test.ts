import { describe, it, expect } from "vitest";
import { quantizeColors, encodePngIndexed } from "./quantize.js";
import { decodePng, encodePng } from "./png.js";
import type { ImageData } from "./png.js";

/** A small image using only a few distinct colours (incl. alpha). */
function fewColors(): ImageData {
  const w = 6, h = 6;
  const palette: [number, number, number, number][] = [
    [255, 0, 0, 255],
    [0, 128, 255, 255],
    [0, 0, 0, 0], // transparent
    [40, 200, 90, 128], // semi-transparent
  ];
  const rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const c = palette[p % palette.length]!;
    rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2]; rgba[p * 4 + 3] = c[3];
  }
  return { width: w, height: h, rgba };
}

describe("quantizeColors", () => {
  it("builds an exact palette when colours <= maxColors", () => {
    const { palette, indices } = quantizeColors(fewColors().rgba, 256);
    expect(palette.length).toBe(4);
    expect(indices.length).toBe(36);
  });

  it("reduces the palette when there are more colours than allowed", () => {
    // 400 distinct colours across a 20x20 image.
    const w = 20, h = 20;
    const rgba = new Uint8Array(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      rgba[p * 4] = p % 256; rgba[p * 4 + 1] = (p * 3) % 256; rgba[p * 4 + 2] = (p * 7) % 256; rgba[p * 4 + 3] = 255;
    }
    const { palette } = quantizeColors(rgba, 16);
    expect(palette.length).toBeLessThanOrEqual(16);
    expect(palette.length).toBeGreaterThan(0);
  });
});

describe("encodePngIndexed", () => {
  it("round-trips a few-colour image byte-for-byte through decodePng", () => {
    const img = fewColors();
    const png = encodePngIndexed(img);
    const back = decodePng(png);
    expect(back.width).toBe(img.width);
    expect(back.height).toBe(img.height);
    expect(Array.from(back.rgba)).toEqual(Array.from(img.rgba));
  });

  it("is smaller than a truecolor PNG for a flat image", () => {
    const w = 32, h = 32;
    const rgba = new Uint8Array(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const red = (p % w) < w / 2;
      rgba[p * 4] = red ? 220 : 20;
      rgba[p * 4 + 1] = 30;
      rgba[p * 4 + 2] = red ? 40 : 200;
      rgba[p * 4 + 3] = 255;
    }
    const img: ImageData = { width: w, height: h, rgba };
    expect(encodePngIndexed(img).length).toBeLessThan(encodePng(img).length);
  });
});
