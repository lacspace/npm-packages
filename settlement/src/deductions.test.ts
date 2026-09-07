import { describe, it, expect } from "vitest";
import { applyDeductions } from "./index";

describe("applyDeductions — fee/commission/tax", () => {
  it("sums flat + rate deductions to the right net (gross → deductions → net)", () => {
    const r = applyDeductions(10_000, [
      { label: "Commission", kind: "commission", bps: 1500 }, // 15% → 1500
      { label: "Gateway", kind: "fee", amount: 30, bps: 290 }, // 30 + 2.9% of 10000 = 30+290
      { label: "VAT", kind: "tax", bps: 1300 }, // 13% → 1300
    ]);
    expect(r.gross).toBe(10_000);
    expect(r.deductions.map((d) => d.amount)).toEqual([1500, 320, 1300]);
    expect(r.totalDeductions).toBe(3120);
    expect(r.net).toBe(6880);
    // net + totalDeductions conserves gross exactly
    expect(r.net + r.totalDeductions).toBe(r.gross);
  });

  it("floors rate deductions (never rounds a deduction up)", () => {
    const r = applyDeductions(999, [{ label: "fee", bps: 250 }]); // 2.5% of 999 = 24.975 → 24
    expect(r.deductions[0]?.amount).toBe(24);
    expect(r.net).toBe(975);
  });

  it("rateBase 'running' applies each rate to the reduced balance", () => {
    const r = applyDeductions(10_000, [
      { label: "Commission", bps: 1000 }, // 10% of 10000 = 1000 → running 9000
      { label: "Tax on remainder", bps: 1000 }, // 10% of 9000 = 900
    ], { rateBase: "running" });
    expect(r.deductions.map((d) => d.amount)).toEqual([1000, 900]);
    expect(r.net).toBe(8100);
  });

  it("clamps net at zero by default, carries negative when allowed", () => {
    const specs = [{ label: "big", amount: 12_000 }];
    expect(applyDeductions(10_000, specs).net).toBe(0);
    expect(applyDeductions(10_000, specs, { allowNegative: true }).net).toBe(-2000);
  });

  it("records bps/base only on rate-based lines and does not mutate specs", () => {
    const specs = [{ label: "flat", amount: 50 }, { label: "rate", bps: 100 }];
    const copy = JSON.parse(JSON.stringify(specs));
    const r = applyDeductions(1000, specs);
    expect(r.deductions[0]).toEqual({ label: "flat", kind: "fee", amount: 50 });
    expect(r.deductions[1]).toEqual({ label: "rate", kind: "fee", amount: 10, bps: 100, base: 1000 });
    expect(specs).toEqual(copy);
  });
});
