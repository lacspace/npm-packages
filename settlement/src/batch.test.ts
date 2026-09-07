import { describe, it, expect } from "vitest";
import { settleBatch, type Transaction } from "./index";

const txns: Transaction[] = [
  { payee: "shop_a", kind: "capture", amount: 10_000, currency: "usd" },
  { payee: "shop_a", kind: "capture", amount: 5_000 },
  { payee: "shop_a", kind: "commission", amount: 1_500 },
  { payee: "shop_a", kind: "refund", amount: 2_000 },
  { payee: "shop_b", kind: "capture", amount: 5_000 },
  { payee: "shop_b", kind: "chargeback", amount: 8_000 },
];

describe("settleBatch — per-payee netting", () => {
  it("nets captures minus fees/commissions/refunds/chargebacks per payee", () => {
    const { settlements, totalNet } = settleBatch(txns);

    const a = settlements.find((s) => s.payee === "shop_a")!;
    expect(a.gross).toBe(15_000);
    expect(a.deductions).toBe(3_500); // 1500 commission + 2000 refund
    expect(a.net).toBe(11_500);
    expect(a.currency).toBe("usd");
    // gross - deductions conserves the net exactly
    expect(a.gross - a.deductions).toBe(a.net);

    const b = settlements.find((s) => s.payee === "shop_b")!;
    expect(b.gross).toBe(5_000);
    expect(b.deductions).toBe(8_000);
    expect(b.net).toBe(0); // clamped (would be -3000)

    // sorted by payee, totalNet is the sum of clamped nets
    expect(settlements.map((s) => s.payee)).toEqual(["shop_a", "shop_b"]);
    expect(totalNet).toBe(11_500);
  });

  it("carries a negative net forward when allowNegative", () => {
    const { settlements } = settleBatch(txns, { allowNegative: true });
    const b = settlements.find((s) => s.payee === "shop_b")!;
    expect(b.net).toBe(-3_000);
  });

  it("groups a per-kind breakdown sorted by kind", () => {
    const { settlements } = settleBatch(txns);
    const a = settlements.find((s) => s.payee === "shop_a")!;
    expect(a.lines).toEqual([
      { kind: "capture", amount: 15_000, count: 2 },
      { kind: "refund", amount: -2_000, count: 1 },
      { kind: "commission", amount: -1_500, count: 1 },
    ]);
  });

  it("treats adjustment as a signed correction in either direction", () => {
    const { settlements } = settleBatch([
      { payee: "p", kind: "capture", amount: 1_000 },
      { payee: "p", kind: "adjustment", amount: -250 },
      { payee: "p", kind: "adjustment", amount: 100 },
    ]);
    const p = settlements[0]!;
    // adjustments net per kind: -250 + 100 = -150 (a net debit line)
    expect(p.lines.find((l) => l.kind === "adjustment")?.amount).toBe(-150);
    expect(p.gross).toBe(1_000); // capture only; the netted adjustment is a debit
    expect(p.deductions).toBe(150);
    expect(p.net).toBe(850); // 1000 - 250 + 100
    expect(p.gross - p.deductions).toBe(p.net);
  });

  it("truncates fractional amounts and does not mutate input", () => {
    const input: Transaction[] = [{ payee: "p", kind: "capture", amount: 10.9 }];
    const copy = JSON.parse(JSON.stringify(input));
    const { settlements } = settleBatch(input);
    expect(settlements[0]?.net).toBe(10);
    expect(input).toEqual(copy);
  });

  it("returns an empty batch for no transactions", () => {
    expect(settleBatch([])).toEqual({ settlements: [], totalNet: 0 });
  });
});
