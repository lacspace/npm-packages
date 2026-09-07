import { describe, it, expect } from "vitest";
import { makeQr } from "./matrix.js";
import { renderToTerminal } from "./terminal.js";
import { renderToSvg } from "./svg.js";
import { renderToPng, renderToImage, encodePng, isPng, crc32 } from "./png.js";
import { parseColor, toCss } from "./color.js";

const qr = makeQr("https://lacspace.com", { ecc: "M" });

describe("renderToTerminal", () => {
  it("emits half-block characters", () => {
    const out = renderToTerminal(qr, { margin: 2 });
    expect(out).toMatch(/[█▀▄ ]/u);
    // Two module rows per text line → roughly half the height.
    const lines = out.split("\n");
    expect(lines.length).toBe(Math.ceil((qr.size + 4) / 2));
  });

  it("invert changes the output", () => {
    const normal = renderToTerminal(qr, { invert: false });
    const inverted = renderToTerminal(qr, { invert: true });
    expect(inverted).not.toBe(normal);
  });
});

describe("renderToSvg", () => {
  it("produces a well-formed SVG with a viewBox", () => {
    const svg = renderToSvg(qr, { size: 300, margin: 4 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
    expect(svg).toContain('width="300"');
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<path");
  });

  it("honours custom colours", () => {
    const svg = renderToSvg(qr, { fg: "#4d9fff", bg: "#101010" });
    expect(svg).toContain('fill="#4d9fff"');
    expect(svg).toContain('fill="#101010"');
  });

  it("omits the background rect when transparent", () => {
    const svg = renderToSvg(qr, { bg: "transparent" });
    expect(svg).not.toContain("<rect width");
  });

  it("uses rounded rects when a radius is given", () => {
    const svg = renderToSvg(qr, { radius: 0.5 });
    expect(svg).toContain("<rect");
    expect(svg).toContain('rx="0.5"');
  });
});

describe("colour parsing", () => {
  it("parses #rgb, #rrggbb and #rrggbbaa", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(parseColor("#4d9fff")).toEqual({ r: 0x4d, g: 0x9f, b: 0xff, a: 255 });
    expect(parseColor("#00000080")).toEqual({ r: 0, g: 0, b: 0, a: 128 });
  });

  it("parses named colours and transparent", () => {
    expect(parseColor("black")).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(parseColor("transparent").a).toBe(0);
  });

  it("round-trips through toCss", () => {
    expect(toCss(parseColor("#4d9fff"))).toBe("#4d9fff");
  });

  it("throws on invalid colours", () => {
    expect(() => parseColor("notacolour")).toThrow();
    expect(() => parseColor("#12345")).toThrow();
  });
});

describe("PNG encoder", () => {
  it("writes a valid PNG signature and IHDR", () => {
    const png = renderToPng(qr, { scale: 2, margin: 2 });
    expect(isPng(png)).toBe(true);
    // IHDR chunk starts at byte 8: 4-byte length (13), then "IHDR".
    expect(Array.from(png.subarray(12, 16))).toEqual([0x49, 0x48, 0x44, 0x52]); // "IHDR"
    expect(png[8 + 8 + 8]).toBe(8); // bit depth
    expect(png[8 + 8 + 9]).toBe(6); // colour type RGBA
  });

  it("dimensions equal (size + 2·margin) · scale", () => {
    const scale = 4;
    const margin = 3;
    const img = renderToImage(qr, { scale, margin });
    const expected = (qr.size + margin * 2) * scale;
    expect(img.width).toBe(expected);
    expect(img.height).toBe(expected);
    expect(img.rgba.length).toBe(expected * expected * 4);
  });

  it("crc32 matches the known IEND value", () => {
    expect(crc32(Uint8Array.from([0x49, 0x45, 0x4e, 0x44]))).toBe(0xae426082);
  });

  it("encodePng rejects a mismatched buffer", () => {
    expect(() => encodePng({ width: 2, height: 2, rgba: new Uint8Array(3) })).toThrow();
  });

  it("colours the corners: dark module top-left of the symbol area", () => {
    // With margin 0 the very first pixel is the top-left finder (dark).
    const img = renderToImage(qr, { scale: 1, margin: 0, fg: "#000000", bg: "#ffffff" });
    expect(Array.from(img.rgba.subarray(0, 3))).toEqual([0, 0, 0]);
  });
});
