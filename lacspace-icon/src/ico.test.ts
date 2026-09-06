import { describe, it, expect } from "vitest";
import { makeIco } from "./ico.js";
import { encodePng, isPng } from "./png.js";
import { resizeRgba } from "./resize.js";
import type { ImageData } from "./png.js";

function solid(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4).fill(200);
  return encodePng({ width: size, height: size, rgba });
}

describe("makeIco", () => {
  it("writes a valid ICONDIR header and entry count", () => {
    const ico = makeIco([
      { png: solid(16), size: 16 },
      { png: solid(32), size: 32 },
      { png: solid(48), size: 48 },
    ]);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // type = icon
    expect(view.getUint16(4, true)).toBe(3); // count
    // First entry width/height byte.
    expect(ico[6]).toBe(16);
    expect(ico[7]).toBe(16);
    expect(view.getUint16(10, true)).toBe(1); // planes
    expect(view.getUint16(12, true)).toBe(32); // bpp
  });

  it("embeds PNG signatures at the declared offsets", () => {
    const entries = [
      { png: solid(16), size: 16 },
      { png: solid(32), size: 32 },
    ];
    const ico = makeIco(entries);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    for (let i = 0; i < entries.length; i++) {
      const offset = view.getUint32(6 + i * 16 + 12, true);
      const len = view.getUint32(6 + i * 16 + 8, true);
      expect(len).toBe(entries[i]!.png.length);
      expect(isPng(ico.subarray(offset, offset + 8))).toBe(true);
    }
  });

  it("encodes size 256 as 0 in the entry", () => {
    const big: ImageData = { width: 256, height: 256, rgba: new Uint8Array(256 * 256 * 4).fill(0) };
    const png = encodePng({ width: 256, height: 256, rgba: resizeRgba(big, 256, 256) });
    const ico = makeIco([{ png, size: 256 }]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });

  it("throws with no images", () => {
    expect(() => makeIco([])).toThrow();
  });
});
