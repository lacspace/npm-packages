import { describe, it, expect } from "vitest";
import { compositeCommission, categoryCommission, type CompositeRule } from "./index";

describe("compositeCommission — flat + percent (+ slabs) with caps/floors", () => {
  it("combines a flat fee and a percentage", () => {
    // flat 30 + 2% of 1000 (=20) = 50
    const r = compositeCommission({ flat: 30, percent: 0.02 }, 1000);
    expect(r.commission).toBe(50);
    expect(r.net).toBe(950);
    expect(r.components).toEqual([
      { kind: "flat", commission: 30 },
      { kind: "percent", commission: 20 },
    ]);
    expect(r.clamped).toBe(false);
  });

  it("caps the combined total", () => {
    const r = compositeCommission({ flat: 30, percent: 0.02, cap: 40 }, 1000);
    expect(r.commission).toBe(40); // 50 capped to 40
    expect(r.clamped).toBe(true);
  });

  it("floors the combined total", () => {
    const r = compositeCommission({ percent: 0.01, floor: 100 }, 1000);
    expect(r.commission).toBe(100); // 10 floored up to 100
    expect(r.clamped).toBe(true);
  });

  it("adds marginal slabs on top of flat + percent", () => {
    const rule: CompositeRule = {
      flat: 10,
      percent: 0.01,
      slabs: [
        { upTo: 500, rate: 0.02 },
        { upTo: null, rate: 0.01 },
      ],
    };
    // flat 10 + percent 10 (1% of 1000) + slabs (500*0.02=10 + 500*0.01=5 =15) = 35
    const r = compositeCommission(rule, 1000);
    expect(r.commission).toBe(35);
    expect(r.components.map((c) => c.kind)).toEqual(["flat", "percent", "slabs"]);
  });
});

describe("categoryCommission — per-category rates", () => {
  const rules: Record<string, CompositeRule> = {
    electronics: { percent: 0.05 },
    grocery: { percent: 0.02, cap: 50 },
    default: { percent: 0.1 },
  };

  it("charges each category by its own rule and sums", () => {
    const r = categoryCommission(rules, [
      { category: "electronics", amount: 10_000 }, // 500
      { category: "grocery", amount: 10_000 }, // 200 -> capped 50
      { category: "books", amount: 1000 }, // default 10% = 100
    ]);
    expect(r.commission).toBe(650);
    const byCat = Object.fromEntries(r.breakdown.map((b) => [b.category, b.commission]));
    expect(byCat).toEqual({ electronics: 500, grocery: 50, books: 100 });
  });

  it("groups multiple items in the same category before charging", () => {
    const r = categoryCommission(rules, [
      { category: "grocery", amount: 400 },
      { category: "grocery", amount: 600 },
    ]);
    // 2% of 1000 = 20 (single grouped charge, under the cap)
    expect(r.commission).toBe(20);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]).toMatchObject({ category: "grocery", amount: 1000, commission: 20 });
  });

  it("contributes 0 for an unknown category with no default", () => {
    const r = categoryCommission({ electronics: { percent: 0.05 } }, [{ category: "toys", amount: 1000 }]);
    expect(r.commission).toBe(0);
  });
});
