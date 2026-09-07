import { describe, it, expect } from "vitest";
import { marketplaceSplit, type MarketplaceConfig } from "./index";

const sumLines = (r: { lines: { amount: number }[] }) => r.lines.reduce((s, l) => s + l.amount, 0);

describe("marketplaceSplit — conserving payout split", () => {
  it("takes a platform commission then shares the remainder; lines sum to gross", () => {
    const cfg: MarketplaceConfig = {
      platform: { type: "percent", rate: 0.2 }, // 20% take
      parties: [
        { party: "seller", rate: 0.9 },
        { party: "affiliate", rate: 0.1 },
      ],
    };
    const r = marketplaceSplit(10_000, cfg);
    expect(r.platformCommission).toBe(2000);
    expect(r.distributable).toBe(8000);
    expect(sumLines(r)).toBe(10_000); // exact conservation
    const byParty = Object.fromEntries(r.parties.map((p) => [p.party, p.amount]));
    expect(byParty).toEqual({ seller: 7200, affiliate: 800 });
    expect(r.parties.reduce((s, p) => s + p.amount, 0)).toBe(r.distributable);
  });

  it("conserves the total exactly with an awkward gross and thirds", () => {
    const r = marketplaceSplit(10_003, {
      platform: { type: "percent", rate: 0.15 },
      parties: [
        { party: "a", rate: 1 },
        { party: "b", rate: 1 },
        { party: "c", rate: 1 },
      ],
    });
    expect(sumLines(r)).toBe(10_003);
    expect(r.parties.reduce((s, p) => s + p.amount, 0)).toBe(r.distributable);
  });

  it("adds an exclusive tax as a separate line that still sums to gross", () => {
    const r = marketplaceSplit(10_000, {
      platform: { type: "percent", rate: 0.2 }, // 2000
      tax: { rate: 0.18 }, // 360, exclusive
      parties: [{ party: "seller", rate: 1 }],
    });
    expect(r.platformCommission).toBe(2000);
    expect(r.tax).toBe(360);
    expect(r.taxInclusive).toBe(false);
    expect(r.distributable).toBe(7640); // 10000 - 2000 - 360
    expect(r.lines.find((l) => l.kind === "tax")?.amount).toBe(360);
    expect(sumLines(r)).toBe(10_000);
  });

  it("treats an inclusive tax as part of the commission (no extra gross line)", () => {
    const r = marketplaceSplit(10_000, {
      platform: { type: "percent", rate: 0.2 }, // 2000, tax-inclusive
      tax: { rate: 0.18, inclusive: true },
      parties: [{ party: "seller", rate: 1 }],
    });
    expect(r.platformCommission).toBe(2000);
    expect(r.taxInclusive).toBe(true);
    expect(r.tax).toBe(305); // ~ 2000 - 2000/1.18
    expect(r.distributable).toBe(8000); // tax is inside the commission
    expect(r.lines.some((l) => l.kind === "tax")).toBe(false);
    expect(sumLines(r)).toBe(10_000);
  });

  it("respects a tiered platform take-rate and still conserves", () => {
    const r = marketplaceSplit(6000, {
      platform: {
        type: "tiered",
        tiers: [
          { upTo: 1000, rate: 0.1 },
          { upTo: 5000, rate: 0.05 },
          { upTo: null, rate: 0.02 },
        ],
      },
      parties: [
        { party: "seller", rate: 0.8 },
        { party: "affiliate", rate: 0.2 },
      ],
    });
    expect(r.platformCommission).toBe(320);
    expect(r.distributable).toBe(5680);
    expect(sumLines(r)).toBe(6000);
  });
});
