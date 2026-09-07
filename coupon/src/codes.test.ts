import { describe, it, expect } from "vitest";
import { normalizeCode, generateCode, generateCodes } from "./index";

describe("normalizeCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizeCode("  save20 ")).toBe("SAVE20");
  });
  it("handles nullish", () => {
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });
});

describe("generateCode", () => {
  it("defaults to 8 chars", () => {
    expect(generateCode().length).toBe(8);
  });

  it("honours length and prefix", () => {
    const code = generateCode({ length: 6, prefix: "SUMMER-" });
    expect(code.startsWith("SUMMER-")).toBe(true);
    expect(code.length).toBe("SUMMER-".length + 6);
  });

  it("only uses characters from the charset", () => {
    const charset = "ABC";
    const code = generateCode({ length: 40, charset });
    expect([...code].every((ch) => charset.includes(ch))).toBe(true);
  });

  it("throws on an empty charset", () => {
    expect(() => generateCode({ charset: "" })).toThrow();
  });

  it("produces different codes across calls (overwhelmingly likely)", () => {
    const a = generateCode({ length: 16 });
    const b = generateCode({ length: 16 });
    expect(a).not.toBe(b);
  });
});

describe("generateCodes", () => {
  it("returns the requested count of unique codes", () => {
    const codes = generateCodes(100, { length: 10 });
    expect(codes.length).toBe(100);
    expect(new Set(codes).size).toBe(100);
  });

  it("returns an empty array for zero", () => {
    expect(generateCodes(0)).toEqual([]);
  });

  it("throws when the keyspace is too small for uniqueness", () => {
    // charset "AB", length 1 → only 2 possible codes, cannot make 10 unique
    expect(() => generateCodes(10, { charset: "AB", length: 1 })).toThrow();
  });
});
