import { describe, it, expect } from "vitest";
import { makeQr } from "./matrix.js";
import type { QrCode } from "./matrix.js";
import { versionSize, alignmentPatternPositions } from "./tables.js";

/** FNV-1a hash of the module grid — a compact fingerprint of the whole matrix. */
function fnv1a(qr: QrCode): number {
  let h = 0x811c9dc5 >>> 0;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      h ^= qr.modules[y]![x] ? 1 : 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

/** A 7×7 finder pattern centred at (cx,cy): dark ring, light ring, dark core. */
function isFinder(qr: QrCode, cx: number, cy: number): boolean {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const cheb = Math.max(Math.abs(dx), Math.abs(dy));
      const expected = cheb !== 2; // dark except the ring at distance 2
      if (qr.modules[cy + dy]![cx + dx] !== expected) return false;
    }
  }
  return true;
}

describe("matrix dimensions", () => {
  it("has the right size for its version", () => {
    expect(makeQr("HI", { version: 1 }).size).toBe(21);
    expect(makeQr("HI", { version: 2 }).size).toBe(25);
    expect(versionSize(7)).toBe(45);
  });

  it("modules grid is square and matches size", () => {
    const qr = makeQr("https://lacspace.com");
    expect(qr.modules.length).toBe(qr.size);
    for (const row of qr.modules) expect(row.length).toBe(qr.size);
  });
});

describe("function patterns", () => {
  const qr = makeQr("HELLO WORLD", { ecc: "M" });

  it("places the three finder patterns", () => {
    expect(isFinder(qr, 3, 3)).toBe(true); // top-left
    expect(isFinder(qr, qr.size - 4, 3)).toBe(true); // top-right
    expect(isFinder(qr, 3, qr.size - 4)).toBe(true); // bottom-left
  });

  it("draws the timing patterns as alternating modules", () => {
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.modules[6]![i]).toBe(i % 2 === 0);
      expect(qr.modules[i]![6]).toBe(i % 2 === 0);
    }
  });

  it("sets the always-dark module", () => {
    expect(qr.modules[qr.size - 8]![8]).toBe(true);
  });
});

describe("alignment patterns", () => {
  it("has none for version 1", () => {
    expect(alignmentPatternPositions(1)).toEqual([]);
  });

  it("places a centre alignment pattern for version 2", () => {
    const qr = makeQr("HELLO WORLD HELLO WORLD", { version: 2, ecc: "L" });
    const pos = alignmentPatternPositions(2); // [6, 18]
    expect(pos).toEqual([6, 18]);
    // The alignment centre at (18,18) is a dark module with a light ring.
    expect(qr.modules[18]![18]).toBe(true);
    expect(qr.modules[17]![18]).toBe(false);
  });

  it("uses documented alignment positions for a mid-size version", () => {
    expect(alignmentPatternPositions(7)).toEqual([6, 22, 38]);
  });
});

describe("format information round-trips", () => {
  // Decode the 15-bit format info back to ecc + mask to prove it was written.
  function decodeFormat(qr: QrCode): { eccBits: number; mask: number } {
    let bits = 0;
    for (let i = 0; i <= 5; i++) bits |= (qr.modules[i]![8] ? 1 : 0) << i;
    bits |= (qr.modules[7]![8] ? 1 : 0) << 6;
    bits |= (qr.modules[8]![8] ? 1 : 0) << 7;
    bits |= (qr.modules[8]![7] ? 1 : 0) << 8;
    for (let i = 9; i < 15; i++) bits |= (qr.modules[8]![14 - i] ? 1 : 0) << i;
    const unmasked = bits ^ 0x5412;
    const data = unmasked >> 10;
    return { eccBits: data >> 3, mask: data & 7 };
  }

  it("stores the chosen ecc and mask", () => {
    const qr = makeQr("HELLO WORLD", { ecc: "Q", mask: 5 });
    const { eccBits, mask } = decodeFormat(qr);
    expect(mask).toBe(5);
    expect(eccBits).toBe(3); // Q → format bits 3
  });

  it("both format copies agree", () => {
    const qr = makeQr("data", { ecc: "H" });
    // Second copy bit 7 lives at (size-1-7, 8); first copy bit 7 at (8,8).
    expect(qr.modules[8]![qr.size - 8]).toBe(qr.modules[8]![8]);
  });
});

describe("version information (version ≥ 7)", () => {
  it("writes 18-bit version info and it decodes back", () => {
    const qr = makeQr("x".repeat(80), { version: 7, ecc: "M" });
    let bits = 0;
    for (let i = 0; i < 18; i++) {
      const a = qr.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      bits |= (qr.modules[b]![a] ? 1 : 0) << i;
    }
    expect(bits >> 12).toBe(7); // top 6 bits are the version number
  });
});

describe("mask selection", () => {
  it("auto-selects a mask in range 0–7", () => {
    const qr = makeQr("https://lacspace.com");
    expect(qr.mask).toBeGreaterThanOrEqual(0);
    expect(qr.mask).toBeLessThanOrEqual(7);
  });

  it("honours a forced mask", () => {
    expect(makeQr("HELLO", { mask: 3 }).mask).toBe(3);
  });

  it("rejects an invalid mask", () => {
    expect(() => makeQr("HELLO", { mask: 9 })).toThrow(/mask/);
  });
});

describe("known-answer matrix fingerprint", () => {
  it("is stable for HELLO WORLD v1-Q mask 5", () => {
    const qr = makeQr("HELLO WORLD", { mode: "alphanumeric", version: 1, ecc: "Q", mask: 5 });
    expect(qr.size).toBe(21);
    let dark = 0;
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y]![x]) dark++;
    expect(dark).toBe(222);
    expect(fnv1a(qr)).toBe(994568201);
  });

  it("is stable for https://lacspace.com at ecc M", () => {
    const qr = makeQr("https://lacspace.com", { ecc: "M" });
    expect(qr.version).toBe(2);
    expect(qr.mask).toBe(2);
    expect(fnv1a(qr)).toBe(2696444815);
  });
});
