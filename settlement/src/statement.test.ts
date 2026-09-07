import { describe, it, expect } from "vitest";
import {
  reconcileSettlement,
  buildStatement,
  settleBatch,
  type PayeeSettlement,
} from "./index";

describe("reconcileSettlement", () => {
  it("flags a mismatch between expected and actual settled amounts", () => {
    const r = reconcileSettlement({ shop_a: 6500, shop_b: 5000 }, { shop_a: 6400, shop_b: 5000 });
    expect(r.matched).toBe(false);
    expect(r.discrepancies).toEqual([
      { account: "shop_a", expected: 6500, actual: 6400, diff: -100 },
    ]);
  });

  it("reports matched when everything reconciles", () => {
    const r = reconcileSettlement({ shop_a: 6500 }, { shop_a: 6500 });
    expect(r.matched).toBe(true);
    expect(r.discrepancies).toEqual([]);
  });
});

describe("buildStatement — render-ready structure", () => {
  const settlement = settleBatch([
    { payee: "shop_a", kind: "capture", amount: 10_000, currency: "usd" },
    { payee: "shop_a", kind: "commission", amount: 1_500 },
  ]).settlements[0] as PayeeSettlement;

  it("produces opening → lines → net → closing with a withheld reserve", () => {
    const stmt = buildStatement(settlement, {
      opening: 200,
      reserve: 500,
      period: { from: "2026-01-01", to: "2026-01-07" },
      clock: () => 1_700_000_000_000,
    });
    expect(stmt.payee).toBe("shop_a");
    expect(stmt.currency).toBe("usd");
    expect(stmt.period).toEqual({ from: "2026-01-01", to: "2026-01-07" });
    expect(stmt.opening).toBe(200);
    expect(stmt.gross).toBe(10_000);
    expect(stmt.deductions).toBe(1_500);
    expect(stmt.reserve).toBe(500);
    // settlement net 8500 - reserve 500 = 8000
    expect(stmt.net).toBe(8_000);
    expect(stmt.closing).toBe(8_200); // opening 200 + net 8000
    expect(stmt.generatedAt).toBe(1_700_000_000_000);
    expect(stmt.lines).toEqual([
      { label: "Sales", amount: 10_000, kind: "capture" },
      { label: "Commission", amount: -1_500, kind: "commission" },
      { label: "Reserve withheld", amount: -500, kind: "reserve" },
    ]);
  });

  it("omits the reserve row and defaults opening to 0 when unset", () => {
    const stmt = buildStatement(settlement);
    expect(stmt.opening).toBe(0);
    expect(stmt.reserve).toBe(0);
    expect(stmt.net).toBe(8_500);
    expect(stmt.closing).toBe(8_500);
    expect(stmt.lines.some((l) => l.kind === "reserve")).toBe(false);
  });

  it("clamps net at zero unless allowNegative", () => {
    const small = settleBatch([{ payee: "p", kind: "capture", amount: 100 }])
      .settlements[0] as PayeeSettlement;
    expect(buildStatement(small, { reserve: 500 }).net).toBe(0);
    expect(buildStatement(small, { reserve: 500, allowNegative: true }).net).toBe(-400);
  });
});
