import { describe, it, expect } from "vitest";
import { pad, roundCorners, circleMask, invert } from "./shape.js";
import type { ImageData } from "./png.js";

/** A fully-opaque solid image. */
function solid(w: number, h: number, rgb: [number, number, number] = [200, 100, 50]): ImageData {
  const rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    rgba[p * 4] = rgb[0]; rgba[p * 4 + 1] = rgb[1]; rgba[p * 4 + 2] = rgb[2]; rgba[p * 4 + 3] = 255;
  }
  return { width: w, height: h, rgba };
}

const alphaAt = (img: ImageData, x: number, y: number) => img.rgba[(y * img.width + x) * 4 + 3]!;

describe("roundCorners", () => {
  it("knocks out the corner but keeps the centre", () => {
    const out = roundCorners(solid(32, 32), 40);
    expect(alphaAt(out, 0, 0)).toBe(0); // corner clipped
    expect(alphaAt(out, 16, 16)).toBe(255); // centre intact
    expect(alphaAt(out, 16, 0)).toBe(255); // mid-edge intact
  });

  it("radius 0 is a no-op on alpha", () => {
    const out = roundCorners(solid(8, 8), 0);
    for (let i = 3; i < out.rgba.length; i += 4) expect(out.rgba[i]).toBe(255);
  });

  it("does not mutate the input", () => {
    const src = solid(16, 16);
    roundCorners(src, 50);
    expect(alphaAt(src, 0, 0)).toBe(255);
  });
});

describe("circleMask", () => {
  it("clips corners and keeps the centre", () => {
    const out = circleMask(solid(32, 32));
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, 31, 31)).toBe(0);
    expect(alphaAt(out, 16, 16)).toBe(255);
  });
});

describe("pad", () => {
  it("shrinks the content and makes the border transparent", () => {
    const out = pad(solid(20, 20), 25); // 25% each side → content ~50%
    expect(out.width).toBe(20);
    expect(alphaAt(out, 0, 0)).toBe(0); // margin is transparent
    expect(alphaAt(out, 10, 10)).toBe(255); // centre still opaque
  });

  it("fills the margin when a bg is given", () => {
    const out = pad(solid(20, 20), 25, "#000000");
    expect(alphaAt(out, 0, 0)).toBe(255);
    expect(out.rgba[0]).toBe(0);
  });
});

describe("invert", () => {
  it("inverts RGB and preserves alpha", () => {
    const out = invert(solid(2, 2, [10, 20, 30]));
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([245, 235, 225, 255]);
  });
});
