import { describe, it, expect } from "vitest";
import { taxOnCommission } from "./index";

describe("taxOnCommission — exclusive (added on top)", () => {
  it("adds tax to the commission as a separate line", () => {
    const r = taxOnCommission(1000, 0.18);
    expect(r.base).toBe(1000);
    expect(r.tax).toBe(180);
    expect(r.total).toBe(1180);
    expect(r.inclusive).toBe(false);
    expect(r.base + r.tax).toBe(r.total);
  });

  it("rounds the tax line with the requested mode at a .5 boundary", () => {
    // 105 * 0.05 = 5.25 -> non-tie; use a genuine tie: 10 * 0.05 = 0.5
    expect(taxOnCommission(10, 0.05, { rounding: "half-up" }).tax).toBe(1);
    expect(taxOnCommission(10, 0.05, { rounding: "half-down" }).tax).toBe(0);
    expect(taxOnCommission(10, 0.05, { rounding: "half-even" }).tax).toBe(0);
  });
});

describe("taxOnCommission — inclusive (backed out)", () => {
  it("splits an inclusive commission so base + tax === total exactly", () => {
    const r = taxOnCommission(1180, 0.18, { inclusive: true });
    expect(r.total).toBe(1180);
    expect(r.base).toBe(1000);
    expect(r.tax).toBe(180);
    expect(r.base + r.tax).toBe(1180);
    expect(r.inclusive).toBe(true);
  });

  it("keeps parts reconciled even when the division is not exact", () => {
    const r = taxOnCommission(1000, 0.18, { inclusive: true });
    // base ~= 847, tax = remainder — the invariant is base + tax === total.
    expect(r.total).toBe(1000);
    expect(r.base + r.tax).toBe(1000);
  });

  it("is a no-op at 0% tax", () => {
    const ex = taxOnCommission(500, 0);
    expect(ex).toMatchObject({ base: 500, tax: 0, total: 500 });
    const inc = taxOnCommission(500, 0, { inclusive: true });
    expect(inc).toMatchObject({ base: 500, tax: 0, total: 500 });
  });
});
