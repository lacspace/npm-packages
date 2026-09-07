import { describe, it, expect } from "vitest";
import {
  selectMode,
  isNumeric,
  isAlphanumeric,
  charCountBits,
  dataBitLength,
  totalBits,
  selectVersion,
  encodeText,
  BitBuffer,
  charCount,
} from "./encode.js";
import { dataCapacityBits, numDataCodewords } from "./tables.js";

describe("mode selection", () => {
  it("detects numeric input", () => {
    expect(isNumeric("12345")).toBe(true);
    expect(isNumeric("12a45")).toBe(false);
    expect(selectMode("8675309")).toBe("numeric");
  });

  it("detects alphanumeric input", () => {
    expect(isAlphanumeric("HELLO WORLD")).toBe(true);
    expect(isAlphanumeric("HELLO $%*+-./:")).toBe(true);
    expect(isAlphanumeric("hello")).toBe(false); // lowercase not in the set
    expect(selectMode("HELLO WORLD")).toBe("alphanumeric");
  });

  it("falls back to byte mode for anything else", () => {
    expect(selectMode("hello")).toBe("byte");
    expect(selectMode("https://a.com")).toBe("byte");
    expect(selectMode("café ☕")).toBe("byte");
  });
});

describe("character-count indicator bit lengths", () => {
  it("varies by version group and mode", () => {
    expect(charCountBits("numeric", 1)).toBe(10);
    expect(charCountBits("numeric", 10)).toBe(12);
    expect(charCountBits("numeric", 27)).toBe(14);
    expect(charCountBits("alphanumeric", 1)).toBe(9);
    expect(charCountBits("alphanumeric", 10)).toBe(11);
    expect(charCountBits("alphanumeric", 40)).toBe(13);
    expect(charCountBits("byte", 1)).toBe(8);
    expect(charCountBits("byte", 10)).toBe(16);
  });
});

describe("data bit lengths", () => {
  it("numeric groups of 3/2/1 digits → 10/7/4 bits", () => {
    expect(dataBitLength("numeric", "123")).toBe(10);
    expect(dataBitLength("numeric", "12")).toBe(7);
    expect(dataBitLength("numeric", "1")).toBe(4);
    expect(dataBitLength("numeric", "1234")).toBe(14);
  });

  it("alphanumeric pairs → 11 bits, singles → 6 bits", () => {
    expect(dataBitLength("alphanumeric", "AB")).toBe(11);
    expect(dataBitLength("alphanumeric", "ABC")).toBe(17);
  });

  it("byte mode counts UTF-8 bytes × 8", () => {
    expect(dataBitLength("byte", "abc")).toBe(24);
    expect(dataBitLength("byte", "é")).toBe(16); // 2 UTF-8 bytes
  });
});

describe("charCount", () => {
  it("uses UTF-8 byte length for byte mode", () => {
    expect(charCount("byte", "é")).toBe(2);
    expect(charCount("alphanumeric", "HELLO")).toBe(5);
  });
});

describe("BitBuffer", () => {
  it("packs bits MSB-first into bytes", () => {
    const bb = new BitBuffer();
    bb.push(0b1010, 4);
    bb.push(0b0101, 4);
    expect(Array.from(bb.toBytes())).toEqual([0b10100101]);
  });

  it("zero-pads the final byte", () => {
    const bb = new BitBuffer();
    bb.push(0b101, 3);
    expect(bb.length).toBe(3);
    expect(Array.from(bb.toBytes())).toEqual([0b10100000]);
  });
});

describe("version selection", () => {
  it("picks version 1 for tiny alphanumeric payloads", () => {
    expect(selectVersion("alphanumeric", "HELLO WORLD", "M", 1)).toBe(1);
  });

  it("selects a bigger version as data grows", () => {
    const small = selectVersion("byte", "x".repeat(10), "M", 1);
    const big = selectVersion("byte", "x".repeat(500), "M", 1);
    expect(big).toBeGreaterThan(small);
  });

  it("respects a minimum version", () => {
    expect(selectVersion("alphanumeric", "HI", "M", 5)).toBe(5);
  });

  it("throws when nothing fits", () => {
    expect(() => selectVersion("byte", "x".repeat(5000), "H", 1)).toThrow(/too long/i);
  });

  it("chosen version's capacity actually holds the payload", () => {
    const v = selectVersion("byte", "x".repeat(100), "Q", 1);
    expect(totalBits("byte", "x".repeat(100), v)).toBeLessThanOrEqual(dataCapacityBits(v, "Q"));
    // …and the previous version would not.
    if (v > 1) expect(totalBits("byte", "x".repeat(100), v - 1)).toBeGreaterThan(dataCapacityBits(v - 1, "Q"));
  });
});

describe("encodeText — known vectors", () => {
  it("produces the standard HELLO WORLD version 1-Q data + ECC codewords", () => {
    const e = encodeText("HELLO WORLD", { mode: "alphanumeric", version: 1, ecc: "Q" });
    expect(e.version).toBe(1);
    // Single block for 1-Q → data then ECC, concatenated.
    expect(Array.from(e.codewords.slice(0, 13))).toEqual([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236]);
    expect(Array.from(e.codewords.slice(13))).toEqual([168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
  });

  it("emits exactly numRawCodewords codewords total", () => {
    const e = encodeText("https://lacspace.com", { ecc: "M" });
    const totalCw = numDataCodewords(e.version, "M") + (e.codewords.length - numDataCodewords(e.version, "M"));
    expect(e.codewords.length).toBe(totalCw);
  });

  it("pads with the alternating 0xEC / 0x11 bytes", () => {
    // A short numeric payload in a forced larger version needs pad bytes.
    const e = encodeText("1", { mode: "numeric", version: 2, ecc: "L" });
    expect(Array.from(e.codewords)).toContain(0xec);
    expect(Array.from(e.codewords)).toContain(0x11);
  });

  it("throws when a forced version is too small", () => {
    expect(() => encodeText("x".repeat(100), { version: 1, ecc: "H" })).toThrow(/does not fit/i);
  });
});
