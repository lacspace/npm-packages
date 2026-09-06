import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { decodeJpeg, isJpeg } from "./jpeg.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(here, "__fixtures__", name)));

/** Average RGB of a small window centred at (cx, cy). */
function sample(img: { width: number; rgba: Uint8Array }, cx: number, cy: number, rad = 1): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      const p = (y * img.width + x) * 4;
      r += img.rgba[p]!;
      g += img.rgba[p + 1]!;
      b += img.rgba[p + 2]!;
      n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function near(actual: number[], expected: number[], tol: number): void {
  for (let i = 0; i < 3; i++) expect(Math.abs(actual[i]! - expected[i]!), `channel ${i}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

describe("isJpeg", () => {
  it("detects the SOI marker and rejects non-JPEG", () => {
    expect(isJpeg(fixture("solid.jpg"))).toBe(true);
    expect(isJpeg(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(false);
  });
});

describe("decodeJpeg (baseline)", () => {
  it("decodes a solid-colour 4:4:4 JPEG to the right dimensions and colour", () => {
    const img = decodeJpeg(fixture("solid.jpg"));
    expect(img.width).toBe(16);
    expect(img.height).toBe(16);
    expect(img.rgba.length).toBe(16 * 16 * 4);
    // Source was #1f9d8f. JPEG is lossy but a flat colour reproduces closely.
    near(sample(img, 8, 8, 2), [0x1f, 0x9d, 0x8f], 14);
    expect(img.rgba[3]).toBe(255); // opaque
  });

  it("decodes a two-region JPEG with distinct left/right colours", () => {
    const img = decodeJpeg(fixture("split.jpg"));
    expect(img.width).toBe(16);
    // Left half ~ red (#d92b2b), right half ~ blue (#2b4fd9).
    near(sample(img, 3, 8), [0xd9, 0x2b, 0x2b], 30);
    near(sample(img, 12, 8), [0x2b, 0x4f, 0xd9], 30);
  });

  it("decodes a chroma-subsampled (4:2:0) JPEG via upsampling", () => {
    const img = decodeJpeg(fixture("sub420.jpg"));
    expect(img.width).toBe(32);
    expect(img.height).toBe(32);
    near(sample(img, 16, 16, 3), [0xc8, 0x1e, 0x5a], 16);
  });

  it("rejects a non-JPEG buffer with a clear error", () => {
    expect(() => decodeJpeg(Uint8Array.from([1, 2, 3, 4]))).toThrow(/Not a JPEG/);
  });
});
