import { describe, it, expect } from "vitest";
import { Surface, gradient, pattern, encode, fit, encodeJpeg, encodePng, parseSize, formatBytes, identicon, mesh, placeholder } from "./index.js";

const PNG_SIG = [137, 80, 78, 71];
const isPng = (b: Uint8Array) => PNG_SIG.every((v, i) => b[i] === v);
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;

describe("bytes", () => {
  it("parses human sizes (binary units)", () => {
    expect(parseSize("1kb")).toBe(1024);
    expect(parseSize("1.5mb")).toBe(Math.floor(1.5 * 1024 * 1024));
    expect(parseSize(2048)).toBe(2048);
    expect(parseSize("500")).toBe(500);
  });
  it("throws on nonsense", () => {
    expect(() => parseSize("banana")).toThrow();
  });
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("Surface drawing", () => {
  it("fills a solid colour", () => {
    const s = new Surface(4, 4).fill("#ff0000");
    expect([s.data[0], s.data[1], s.data[2], s.data[3]]).toEqual([255, 0, 0, 255]);
  });
  it("builds a gradient with distinct ends", () => {
    const g = gradient(64, 8, { angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] });
    const left = g.data[0]!;
    const right = g.data[(63) * 4]!;
    expect(right).toBeGreaterThan(left);
  });
  it("resizes to new dimensions", () => {
    const s = gradient(100, 100, { stops: [{ offset: 0, color: "#111" }, { offset: 1, color: "#eee" }] });
    const r = s.resize(20, 10);
    expect(r.width).toBe(20);
    expect(r.height).toBe(10);
  });
  it("blends a translucent rect", () => {
    const s = new Surface(2, 2).fill("#000000").rect(0, 0, 2, 2, "rgba(255,255,255,0.5)");
    expect(s.data[0]).toBeGreaterThan(100);
    expect(s.data[0]).toBeLessThan(200);
  });
});

describe("encoders", () => {
  const img = pattern(48, 48, "#0b3d91", "dots", { size: 12, color: "#ffffff" });

  it("encodes a valid PNG", async () => {
    const r = await encode(img, { format: "png" });
    expect(isPng(r.bytes)).toBe(true);
    expect(r.size).toBe(r.bytes.length);
  });

  it("encodes a valid baseline JPEG (pure JS)", () => {
    const bytes = encodeJpeg(img, 80);
    expect(isJpeg(bytes)).toBe(true);
  });

  it("lower JPEG quality yields fewer bytes", () => {
    const hi = encodeJpeg(img, 90).length;
    const lo = encodeJpeg(img, 20).length;
    expect(lo).toBeLessThan(hi);
  });

  it("PNG round-trips dimensions in the header", async () => {
    const r = await encode(new Surface(37, 19).fill("#123456"), { format: "png" });
    // IHDR width/height are big-endian at bytes 16..23
    const w = (r.bytes[16]! << 24) | (r.bytes[17]! << 16) | (r.bytes[18]! << 8) | r.bytes[19]!;
    const h = (r.bytes[20]! << 24) | (r.bytes[21]! << 16) | (r.bytes[22]! << 8) | r.bytes[23]!;
    expect(w).toBe(37);
    expect(h).toBe(19);
  });
});

describe("fit (size budget)", () => {
  const photo = gradient(400, 400, {
    angle: 45,
    stops: [{ offset: 0, color: "#ff5f6d" }, { offset: 0.5, color: "#845ec2" }, { offset: 1, color: "#00c9a7" }],
  }).pattern("noise", { strength: 0.12 });

  it("hits a JPEG budget at or under the ceiling", async () => {
    const budget = 20 * 1024;
    const r = await fit(photo, { format: "jpeg", maxBytes: budget });
    expect(isJpeg(r.bytes)).toBe(true);
    expect(r.size).toBeLessThanOrEqual(budget);
  });

  it("shrinks a PNG toward a tight budget", async () => {
    const full = (await encode(photo, { format: "png" })).size;
    const r = await fit(photo, { format: "png", maxBytes: Math.floor(full / 2) });
    expect(r.size).toBeLessThan(full);
  });
});

describe("generators", () => {
  it("identicon is square, deterministic and horizontally symmetric", () => {
    const a = identicon("ada@lacspace.com", { size: 120 });
    const b = identicon("ada@lacspace.com", { size: 120 });
    expect(a.width).toBe(120);
    expect(Buffer.from(a.data)).toEqual(Buffer.from(b.data));
    // mirror check: left column pixel == right column pixel
    const x0 = 0, x1 = a.width - 1, y = 60;
    const p0 = (y * a.width + x0) * 4;
    const p1 = (y * a.width + x1) * 4;
    expect([a.data[p0], a.data[p0 + 1], a.data[p0 + 2]]).toEqual([a.data[p1], a.data[p1 + 1], a.data[p1 + 2]]);
    expect(identicon("someone-else@x.com").data).not.toEqual(a.data);
  });

  it("mesh fills every pixel opaque and is seed-deterministic", () => {
    const m = mesh(80, 50, { seed: "brand" });
    expect(m.width).toBe(80);
    expect(m.data[3]).toBe(255);
    expect(Buffer.from(mesh(80, 50, { seed: "brand" }).data)).toEqual(Buffer.from(m.data));
  });

  it("placeholder produces a valid encodable surface", async () => {
    const p = placeholder(300, 158, { seed: "hero" });
    const r = await encode(p, { format: "png" });
    expect(r.bytes[0]).toBe(137); // PNG signature
    expect(r.width).toBe(300);
  });
});
