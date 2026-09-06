import { describe, it, expect } from "vitest";
import { dominantColor, rgbToHex } from "./color.js";
import type { ImageData } from "./png.js";

function fill(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): ImageData {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const [r, g, b, a] = fn(x, y);
      rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = a;
    }
  }
  return { width: w, height: h, rgba };
}

describe("rgbToHex", () => {
  it("formats and clamps channels", () => {
    expect(rgbToHex(255, 0, 128)).toBe("#ff0080");
    expect(rgbToHex(-5, 300, 16)).toBe("#00ff10");
  });
});

describe("dominantColor", () => {
  it("returns the single colour of a solid image", () => {
    const img = fill(8, 8, () => [0x20, 0x99, 0x88, 255]);
    expect(dominantColor(img)).toBe("#209988");
  });

  it("prefers the saturated accent over a neutral majority", () => {
    // 75% mid-grey, 25% vivid orange — the accent should win on saturation weight.
    const img = fill(8, 8, (x) => (x < 6 ? [128, 128, 128, 255] : [255, 120, 0, 255]));
    const hex = dominantColor(img);
    expect(hex).toBe("#ff7800");
  });

  it("ignores transparent pixels", () => {
    const img = fill(8, 8, (x) => (x === 0 ? [10, 20, 30, 255] : [0, 0, 0, 0]));
    expect(dominantColor(img)).toBe("#0a141e");
  });

  it("accepts a raw RGBA byte array", () => {
    expect(dominantColor(Uint8Array.from([200, 30, 30, 255]))).toBe("#c81e1e");
  });
});
