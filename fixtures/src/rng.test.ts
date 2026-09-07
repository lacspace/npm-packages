import { beforeEach, describe, expect, it } from "vitest";
import { defineFactory, makeRng, mulberry32, resetSequences, seed } from "./index";

describe("RNG helpers via ctx", () => {
  beforeEach(() => {
    seed(2024);
    resetSequences();
  });

  const f = defineFactory({
    name: "rng-probe",
    build: (c) => ({
      i: c.int(1, 6),
      f: c.float(0, 1),
      b: c.bool(),
      p: c.pick(["r", "g", "b"] as const),
      s: c.sample([1, 2, 3, 4, 5], 3),
      u: c.uuid(),
      n: c.next(),
    }),
  });

  it("int() stays within the inclusive range", () => {
    resetSequences();
    for (const x of f.buildList(20)) {
      expect(x.i).toBeGreaterThanOrEqual(1);
      expect(x.i).toBeLessThanOrEqual(6);
    }
  });

  it("float() stays within [min, max)", () => {
    resetSequences();
    for (const x of f.buildList(20)) {
      expect(x.f).toBeGreaterThanOrEqual(0);
      expect(x.f).toBeLessThan(1);
    }
  });

  it("pick() returns an element of the array", () => {
    resetSequences();
    for (const x of f.buildList(10)) {
      expect(["r", "g", "b"]).toContain(x.p);
    }
  });

  it("sample() returns n distinct elements", () => {
    resetSequences();
    const x = f.build();
    expect(x.s).toHaveLength(3);
    expect(new Set(x.s).size).toBe(3);
  });

  it("uuid() matches the v4 shape", () => {
    resetSequences();
    const x = f.build();
    expect(x.u).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("produces identical values for the same seed", () => {
    resetSequences();
    const a = f.build();
    seed(2024);
    resetSequences();
    const b = f.build();
    expect(b).toEqual(a);
  });

  it("named factories get decorrelated streams", () => {
    const a = defineFactory({ name: "alpha", build: (c) => ({ v: c.int(0, 1_000_000) }) });
    const b = defineFactory({ name: "beta", build: (c) => ({ v: c.int(0, 1_000_000) }) });
    resetSequences();
    seed(1);
    // Overwhelmingly likely to differ across independent streams.
    expect(a.build().v).not.toBe(b.build().v);
  });
});

describe("low-level primitives", () => {
  it("mulberry32 is deterministic for a seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("makeRng wraps a raw stream into helper methods", () => {
    const rng = makeRng(mulberry32(7));
    expect(typeof rng.int(1, 10)).toBe("number");
    expect(rng.sample([1, 2, 3], 2)).toHaveLength(2);
  });

  it("pick() throws on an empty array", () => {
    const rng = makeRng(mulberry32(1));
    expect(() => rng.pick([])).toThrow();
  });
});
