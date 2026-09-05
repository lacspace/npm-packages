import { describe, it, expect } from "vitest";
import { commission, split, type CommissionRule } from "./index";

describe("commission — flat", () => {
  it("charges a fixed fee and computes net", () => {
    const r = commission({ type: "flat", amount: 250 }, 1000);
    expect(r.commission).toBe(250);
    expect(r.net).toBe(750);
    expect(r.effectiveRate).toBeCloseTo(0.25, 10);
  });

  it("effectiveRate is 0 when amount is 0", () => {
    const r = commission({ type: "flat", amount: 250 }, 0);
    expect(r.effectiveRate).toBe(0);
    expect(r.net).toBe(-250);
  });
});

describe("commission — percent", () => {
  it("takes a percentage and rounds to minor units", () => {
    const r = commission({ type: "percent", rate: 0.15 }, 1000);
    expect(r.commission).toBe(150);
    expect(r.net).toBe(850);
    expect(r.effectiveRate).toBeCloseTo(0.15, 10);
  });

  it("rounds to the nearest minor unit", () => {
    // 333 * 0.1 = 33.3 -> 33
    expect(commission({ type: "percent", rate: 0.1 }, 333).commission).toBe(33);
    // 335 * 0.1 = 33.5 -> 34
    expect(commission({ type: "percent", rate: 0.1 }, 335).commission).toBe(34);
  });
});

describe("commission — tiered (marginal)", () => {
  const rule: CommissionRule = {
    type: "tiered",
    tiers: [
      { upTo: 1000, rate: 0.1 },
      { upTo: 5000, rate: 0.05 },
      { upTo: null, rate: 0.02 },
    ],
  };

  it("applies each bracket marginally", () => {
    // 0..1000 -> 100, 1000..5000 -> 200, 5000..6000 -> 20 => 320
    expect(commission(rule, 6000).commission).toBe(320);
  });

  it("only uses filled brackets for a small amount", () => {
    // entirely in first bracket: 500 * 0.1 = 50
    expect(commission(rule, 500).commission).toBe(50);
  });

  it("stops exactly at a bracket boundary", () => {
    // 0..1000 -> 100, 1000..5000 -> 200 => 300
    expect(commission(rule, 5000).commission).toBe(300);
  });
});

describe("commission — min / max bounds", () => {
  it("caps the commission at max", () => {
    const r = commission({ type: "percent", rate: 0.2, max: 100 }, 1000);
    expect(r.commission).toBe(100); // 200 capped to 100
    expect(r.net).toBe(900);
  });

  it("raises the commission to min (floor)", () => {
    const r = commission({ type: "percent", rate: 0.01, min: 50 }, 1000);
    expect(r.commission).toBe(50); // 10 floored up to 50
  });

  it("clamps within [min, max]", () => {
    expect(commission({ type: "flat", amount: 5, min: 10, max: 40 }, 1000).commission).toBe(10);
    expect(commission({ type: "flat", amount: 999, min: 10, max: 40 }, 1000).commission).toBe(40);
    expect(commission({ type: "flat", amount: 25, min: 10, max: 40 }, 1000).commission).toBe(25);
  });
});

describe("split — exact-sum proportional allocation", () => {
  it("splits evenly with no lost units", () => {
    const parts = split(1000, [
      { party: "a", rate: 1 },
      { party: "b", rate: 1 },
    ]);
    expect(parts).toEqual([
      { party: "a", amount: 500 },
      { party: "b", amount: 500 },
    ]);
  });

  it("distributes the remainder so the sum is exact", () => {
    // 100 across three equal shares -> 34/33/33
    const parts = split(100, [
      { party: "a", rate: 1 },
      { party: "b", rate: 1 },
      { party: "c", rate: 1 },
    ]);
    const sum = parts.reduce((s, p) => s + p.amount, 0);
    expect(sum).toBe(100);
    expect(parts.map((p) => p.amount).sort((x, y) => y - x)).toEqual([34, 33, 33]);
  });

  it("honours weighted rates and keeps the sum exact", () => {
    const parts = split(1000, [
      { party: "a", rate: 0.7 },
      { party: "b", rate: 0.3 },
    ]);
    expect(parts).toEqual([
      { party: "a", amount: 700 },
      { party: "b", amount: 300 },
    ]);
  });

  it("gives leftover to the largest fractional remainder", () => {
    // ideals: a=333.33.., b=333.33.., c=333.33.. one leftover
    const parts = split(1000, [
      { party: "a", rate: 1 },
      { party: "b", rate: 1 },
      { party: "c", rate: 1 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1000);
  });

  it("falls back to even split when rates sum to zero", () => {
    const parts = split(10, [
      { party: "a", rate: 0 },
      { party: "b", rate: 0 },
      { party: "c", rate: 0 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(10);
    expect(parts.map((p) => p.amount)).toEqual([4, 3, 3]);
  });

  it("returns [] for no shares", () => {
    expect(split(1000, [])).toEqual([]);
  });
});
