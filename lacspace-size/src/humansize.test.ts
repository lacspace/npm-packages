import { describe, it, expect } from "vitest";
import { parseSize, formatSize, formatDelta } from "./humansize.js";

describe("parseSize", () => {
  it("parses bare numbers and bytes as bytes", () => {
    expect(parseSize("1024")).toBe(1024);
    expect(parseSize(2048)).toBe(2048);
    expect(parseSize("500b")).toBe(500);
    expect(parseSize("0")).toBe(0);
  });

  it("parses decimal (SI) units", () => {
    expect(parseSize("1kb")).toBe(1000);
    expect(parseSize("1.5kb")).toBe(1500);
    expect(parseSize("2mb")).toBe(2_000_000);
    expect(parseSize("1gb")).toBe(1_000_000_000);
  });

  it("parses binary (IEC) units", () => {
    expect(parseSize("1kib")).toBe(1024);
    expect(parseSize("1mib")).toBe(1024 * 1024);
    expect(parseSize("2gib")).toBe(2 * 1024 ** 3);
  });

  it("treats single-letter shorthands as binary", () => {
    expect(parseSize("200k")).toBe(200 * 1024);
    expect(parseSize("1m")).toBe(1024 * 1024);
  });

  it("is case-insensitive and tolerates a space", () => {
    expect(parseSize("2 KB")).toBe(2000);
    expect(parseSize("3 MiB")).toBe(3 * 1024 * 1024);
  });

  it("throws on garbage", () => {
    expect(() => parseSize("abc")).toThrow();
    expect(() => parseSize("10zz")).toThrow();
    expect(() => parseSize("")).toThrow();
  });
});

describe("formatSize", () => {
  it("shows bytes below one unit", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(999)).toBe("999 B");
  });

  it("formats decimal units by default", () => {
    expect(formatSize(1000)).toBe("1 kB");
    expect(formatSize(1500)).toBe("1.5 kB");
    expect(formatSize(2_000_000)).toBe("2 MB");
  });

  it("formats binary units on request", () => {
    expect(formatSize(1024, { binary: true })).toBe("1 KiB");
    expect(formatSize(1536, { binary: true })).toBe("1.5 KiB");
  });

  it("trims trailing zeros", () => {
    expect(formatSize(3000)).toBe("3 kB");
    expect(formatSize(3210)).toBe("3.21 kB");
  });
});

describe("parse/format round-trip", () => {
  it("round-trips clean decimal values", () => {
    for (const s of ["1 kB", "2.5 kB", "3 MB"]) {
      expect(formatSize(parseSize(s.replace(" ", "")))).toBe(s);
    }
  });
});

describe("formatDelta", () => {
  it("prefixes a sign", () => {
    expect(formatDelta(1500)).toBe("+1.5 kB");
    expect(formatDelta(-2000)).toBe("-2 kB");
    expect(formatDelta(0)).toBe("0 B");
  });
});
