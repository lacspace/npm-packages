import { describe, it, expect } from "vitest";
import { resizeRgba } from "./resize.js";
import type { ImageData } from "./png.js";

function img(width: number, height: number, rgba: number[]): ImageData {
  return { width, height, rgba: Uint8Array.from(rgba) };
}

describe("resizeRgba", () => {
  it("2x2 -> 1x1 area-average equals the mean of the four (opaque) pixels", () => {
    // Reds 10,20,30,40 (avg 25); greens 40,60,80,100 (avg 70); blues 0,0,0,0.
    const src = img(2, 2, [
      10, 40, 0, 255, 20, 60, 0, 255,
      30, 80, 0, 255, 40, 100, 0, 255,
    ]);
    const out = resizeRgba(src, 1, 1);
    expect(Array.from(out)).toEqual([25, 70, 0, 255]);
  });

  it("4x4 -> 2x2 averages each 2x2 block", () => {
    // Build a 4x4 where each of the four 2x2 quadrants is a constant colour.
    const q = [10, 100, 200, 250]; // top-left, top-right, bottom-left, bottom-right greyscale-ish reds
    const rgba: number[] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const block = (y < 2 ? 0 : 2) + (x < 2 ? 0 : 1);
        const v = q[block]!;
        rgba.push(v, v, v, 255);
      }
    }
    const out = resizeRgba(img(4, 4, rgba), 2, 2);
    // Each dest pixel = the constant of its quadrant.
    expect(Array.from(out)).toEqual([
      10, 10, 10, 255, 100, 100, 100, 255,
      200, 200, 200, 255, 250, 250, 250, 255,
    ]);
  });

  it("returns an identical copy when target equals source", () => {
    const src = img(2, 1, [1, 2, 3, 4, 5, 6, 7, 8]);
    const out = resizeRgba(src, 2, 1);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps fully transparent pixels transparent", () => {
    const src = img(2, 2, [
      255, 0, 0, 0, 255, 0, 0, 0,
      255, 0, 0, 0, 255, 0, 0, 0,
    ]);
    const out = resizeRgba(src, 1, 1);
    expect(out[3]).toBe(0);
  });

  it("upscales 1x1 -> 2x2 by replicating the pixel", () => {
    const out = resizeRgba(img(1, 1, [12, 34, 56, 255]), 2, 2);
    expect(Array.from(out)).toEqual([
      12, 34, 56, 255, 12, 34, 56, 255,
      12, 34, 56, 255, 12, 34, 56, 255,
    ]);
  });
});
