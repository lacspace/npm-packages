import { describe, it, expect } from "vitest";
import { RNG, hashSeed, normalizeSeed } from "./prng.js";

describe("RNG determinism", () => {
  it("same numeric seed → identical sequence", () => {
    const a = new RNG(42);
    const b = new RNG(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds → different sequences", () => {
    const a = Array.from({ length: 10 }, (_, __) => 0).map(() => new RNG(1).next());
    const b = new RNG(2).next();
    expect(a[0]).not.toEqual(b);
  });

  it("string seed is stable across instances", () => {
    const a = new RNG("lacspace");
    const b = new RNG("lacspace");
    expect(a.uuid()).toEqual(b.uuid());
  });

  it("next() stays within [0,1)", () => {
    const r = new RNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("RNG helpers", () => {
  it("int is inclusive and within bounds", () => {
    const r = new RNG(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(6)).toBe(true);
  });

  it("int handles swapped min/max", () => {
    const r = new RNG(1);
    const v = r.int(10, 2);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThanOrEqual(10);
  });

  it("float respects decimals and bounds", () => {
    const r = new RNG(9);
    for (let i = 0; i < 200; i++) {
      const v = r.float(0, 1, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1.001);
      const decimals = (String(v).split(".")[1] ?? "").length;
      expect(decimals).toBeLessThanOrEqual(3);
    }
  });

  it("bool(1) always true, bool(0) always false", () => {
    const r = new RNG(5);
    expect(r.bool(1)).toBe(true);
    expect(r.bool(0)).toBe(false);
  });

  it("pick throws on empty", () => {
    const r = new RNG(1);
    expect(() => r.pick([])).toThrow();
  });

  it("weighted honours weight ratios roughly", () => {
    const r = new RNG(123);
    let a = 0;
    for (let i = 0; i < 2000; i++) {
      if (r.weighted([["a", 1], ["b", 9]] as const) === "a") a++;
    }
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(400); // ~10%
  });

  it("uuid is a valid v4 shape", () => {
    const r = new RNG(1);
    const u = r.uuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("hex/digits produce the requested length", () => {
    const r = new RNG(2);
    expect(r.hex(24)).toHaveLength(24);
    expect(r.digits(9)).toMatch(/^\d{9}$/);
  });
});

describe("seed normalization", () => {
  it("hashSeed is deterministic", () => {
    expect(hashSeed("abc")).toEqual(hashSeed("abc"));
  });
  it("numeric string seed equals number seed", () => {
    expect(normalizeSeed("42")).toEqual(normalizeSeed(42));
  });
});
