import { describe, it, expect } from "vitest";
import { generateSplash } from "./splash.js";
import { decodePng, isPng } from "./png.js";
import type { ImageData } from "./png.js";

function solid(size: number): ImageData {
  const rgba = new Uint8Array(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    rgba[p * 4] = 100; rgba[p * 4 + 1] = 150; rgba[p * 4 + 2] = 200; rgba[p * 4 + 3] = 255;
  }
  return { width: size, height: size, rgba };
}

describe("generateSplash", () => {
  const { files, entries } = generateSplash(solid(64), "#0b0b0f");

  it("emits both orientations for the flagship device sizes", () => {
    expect(files["apple-splash-1290-2796.png"]).toBeDefined(); // 15 Pro Max portrait
    expect(files["apple-splash-2796-1290.png"]).toBeDefined(); // landscape
    expect(files["apple-splash-2048-2732.png"]).toBeDefined(); // iPad Pro 12.9" portrait
  });

  it("each entry has a media query and a matching PNG file", () => {
    expect(entries.length).toBeGreaterThan(10);
    for (const e of entries) {
      expect(files[e.filename], e.filename).toBeDefined();
      expect(isPng(files[e.filename]!)).toBe(true);
      expect(e.media).toMatch(/orientation: (portrait|landscape)/);
      expect(e.media).toMatch(/-webkit-device-pixel-ratio/);
    }
  });

  it("renders at the exact device pixel size on an opaque bg", () => {
    const img = decodePng(files["apple-splash-1290-2796.png"]!);
    expect(img.width).toBe(1290);
    expect(img.height).toBe(2796);
    expect(img.rgba[3]).toBe(255); // opaque bg
  });
});
