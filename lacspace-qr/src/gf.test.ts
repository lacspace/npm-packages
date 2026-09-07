import { describe, it, expect } from "vitest";
import { gfMul, gfExp, gfLog, gfPow, rsComputeDivisor, rsComputeRemainder, GF_PRIMITIVE } from "./gf.js";

// A reference "Russian-peasant" GF(256) multiply to cross-check the table math.
function peasant(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * GF_PRIMITIVE);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

describe("GF(256) tables", () => {
  it("has α^0 = 1 and α^1 = 2", () => {
    expect(gfExp(0)).toBe(1);
    expect(gfExp(1)).toBe(2);
  });

  it("has α^8 = 0x1D (the primitive polynomial reduction)", () => {
    expect(gfExp(8)).toBe(0x1d);
  });

  it("is cyclic with period 255", () => {
    expect(gfExp(255)).toBe(1);
    expect(gfExp(510)).toBe(1);
  });

  it("log is the inverse of exp", () => {
    expect(gfLog(1)).toBe(0);
    expect(gfLog(2)).toBe(1);
    for (let e = 1; e < 255; e++) expect(gfLog(gfExp(e))).toBe(e);
  });

  it("throws on log(0)", () => {
    expect(() => gfLog(0)).toThrow();
  });
});

describe("gfMul", () => {
  it("handles the multiplicative identity and zero", () => {
    expect(gfMul(0, 123)).toBe(0);
    expect(gfMul(123, 0)).toBe(0);
    expect(gfMul(1, 123)).toBe(123);
    expect(gfMul(123, 1)).toBe(123);
  });

  it("matches known small products", () => {
    expect(gfMul(2, 2)).toBe(4);
    expect(gfMul(2, 128)).toBe(0x1d); // α^1 · α^7 = α^8
    expect(gfMul(3, 7)).toBe(9);
  });

  it("agrees with a reference peasant multiply across the field", () => {
    for (let a = 0; a < 256; a += 7) {
      for (let b = 0; b < 256; b += 5) {
        expect(gfMul(a, b)).toBe(peasant(a, b));
      }
    }
  });

  it("is commutative", () => {
    expect(gfMul(45, 200)).toBe(gfMul(200, 45));
  });
});

describe("gfPow", () => {
  it("computes powers of α", () => {
    expect(gfPow(2, 8)).toBe(0x1d);
    expect(gfPow(2, 0)).toBe(1);
    expect(gfPow(5, 2)).toBe(gfMul(5, 5));
  });
});

describe("Reed–Solomon generators", () => {
  it("produces the standard degree-10 generator polynomial", () => {
    const div = rsComputeDivisor(10);
    expect(Array.from(div).map((x) => gfLog(x))).toEqual([251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
  });

  it("produces the standard degree-7 generator polynomial", () => {
    const div = rsComputeDivisor(7);
    expect(Array.from(div).map((x) => gfLog(x))).toEqual([87, 229, 146, 149, 238, 102, 21]);
  });

  it("produces the standard degree-13 generator polynomial", () => {
    // Version 1-Q uses 13 EC codewords.
    const div = rsComputeDivisor(13);
    expect(div.length).toBe(13);
    expect(gfLog(div[0]!)).toBe(74); // leading coefficient exponent
  });

  it("rejects out-of-range degrees", () => {
    expect(() => rsComputeDivisor(0)).toThrow();
    expect(() => rsComputeDivisor(300)).toThrow();
  });
});

describe("rsComputeRemainder", () => {
  it("computes the known ECC for HELLO WORLD (version 1-Q)", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
    const ecc = rsComputeRemainder(data, rsComputeDivisor(13));
    expect(Array.from(ecc)).toEqual([168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
  });

  it("returns a remainder of the divisor's length", () => {
    const ecc = rsComputeRemainder([1, 2, 3, 4], rsComputeDivisor(10));
    expect(ecc.length).toBe(10);
  });

  it("gives all-zero ECC for all-zero data", () => {
    const ecc = rsComputeRemainder([0, 0, 0], rsComputeDivisor(7));
    expect(Array.from(ecc)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
