import { describe, it, expect } from "vitest";
import { slabCommission, volumeTier, volumeCommission, type Slab, type VolumeTier } from "./index";

const slabs: Slab[] = [
  { upTo: 100_000, rate: 0.05, label: "up to 1L" }, // 5% up to 1,00,000
  { upTo: null, rate: 0.03, label: "above 1L" }, // 3% above
];

describe("slabCommission — progressive slabs with breakdown", () => {
  it("charges each slab marginally and sums the breakdown to the total", () => {
    // 0..100000 -> 5000, 100000..150000 -> 1500 => 6500
    const r = slabCommission(slabs, 150_000);
    expect(r.commission).toBe(6500);
    expect(r.net).toBe(143_500);
    const sum = r.breakdown.reduce((s, l) => s + l.commission, 0);
    expect(sum).toBe(r.commission);
    expect(r.breakdown).toHaveLength(2);
    expect(r.breakdown[0]).toMatchObject({ from: 0, to: 100_000, portion: 100_000, rate: 0.05, commission: 5000, label: "up to 1L" });
    expect(r.breakdown[1]).toMatchObject({ from: 100_000, to: 150_000, portion: 50_000, rate: 0.03, commission: 1500 });
  });

  it("only fills reached slabs for a small amount", () => {
    const r = slabCommission(slabs, 40_000);
    expect(r.commission).toBe(2000); // 40000 * 5%
    expect(r.breakdown).toHaveLength(1);
  });

  it("honours a cap on the total", () => {
    const r = slabCommission(slabs, 150_000, { max: 6000 });
    expect(r.commission).toBe(6000);
  });

  it("rounds each slab with the requested mode", () => {
    // portion 105 @ 5% = 5.25 -> 5 (half-up, not a tie), portion 5 @ 0.1 = 0.5 tie
    const s: Slab[] = [
      { upTo: 105, rate: 0.05 },
      { upTo: null, rate: 0.1 },
    ];
    expect(slabCommission(s, 110, { rounding: "half-up" }).commission).toBe(6); // 5 + 1
    expect(slabCommission(s, 110, { rounding: "half-down" }).commission).toBe(5); // 5 + 0
  });
});

const volTiers: VolumeTier[] = [
  { from: 0, rate: 0.05, label: "base" },
  { from: 100_000, rate: 0.04, label: "silver" },
  { from: 500_000, rate: 0.03, label: "gold" },
];

describe("volumeTier / volumeCommission — threshold tiers (whole-amount rate)", () => {
  it("selects the highest reached threshold", () => {
    expect(volumeTier(volTiers, 50_000)?.label).toBe("base");
    expect(volumeTier(volTiers, 100_000)?.label).toBe("silver");
    expect(volumeTier(volTiers, 750_000)?.label).toBe("gold");
  });

  it("applies the selected rate to the whole amount", () => {
    const r = volumeCommission(volTiers, 600_000);
    expect(r.commission).toBe(18_000); // 3% of the whole amount
    expect(r.breakdown[0]).toMatchObject({ rate: 0.03, portion: 600_000, commission: 18_000 });
  });

  it("charges nothing when no tier qualifies", () => {
    const r = volumeCommission([{ from: 1000, rate: 0.1 }], 500);
    expect(r.commission).toBe(0);
    expect(r.breakdown).toHaveLength(0);
  });
});
