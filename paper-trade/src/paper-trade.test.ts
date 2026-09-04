import { test, expect } from "vitest";
import { PaperAccount } from "./index";

test("buy then mark price up gives positive unrealized P&L", () => {
  const acct = new PaperAccount({ cash: 100_000 });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 10 });
  expect(o.status).toBe("FILLED");
  acct.mark("ABC", 110);
  expect(acct.unrealizedPnl).toBeCloseTo(100, 2); // (110 - 100) * 10
  expect(acct.unrealizedPnl).toBeGreaterThan(0);
});

test("a short round-trip realizes the correct P&L sign", () => {
  const acct = new PaperAccount({ cash: 100_000, allowShort: true });
  acct.mark("XYZ", 100);
  acct.sell("XYZ", { qty: 10 }); // open short at 100
  acct.mark("XYZ", 90);
  acct.buy("XYZ", { qty: 10 }); // cover at 90 → profit
  expect(acct.realizedPnl).toBeCloseTo(100, 2); // (100 - 90) * 10
  expect(acct.realizedPnl).toBeGreaterThan(0);
});

test("net account pnl equals summary().totalPnl after a charged fill", () => {
  const acct = new PaperAccount({ cash: 100_000, charges: () => 5 });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 }); // cost 1000, charge 5
  acct.mark("ABC", 110);
  expect(acct.totalCharges).toBe(5);
  expect(acct.pnl).toBe(acct.summary().totalPnl);
  expect(acct.pnl).toBeCloseTo(95, 2); // 100 unrealized - 5 charges
});

test("a rejected order (bad qty) is logged with REJECTED status", () => {
  const acct = new PaperAccount({ cash: 100_000 });
  acct.mark("ABC", 100);
  const bad = acct.buy("ABC", { qty: -5 });
  expect(bad.status).toBe("REJECTED");
  expect(bad.reason).toMatch(/qty/i);
  expect(acct.orders.some((o) => o.status === "REJECTED")).toBe(true);
});

test("a rejected order (insufficient cash) is logged with REJECTED status", () => {
  const acct = new PaperAccount({ cash: 100 });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 10 }); // cost 1000 > 100 cash
  expect(o.status).toBe("REJECTED");
  expect(o.reason).toMatch(/cash/i);
  expect(acct.orders.filter((x) => x.status === "REJECTED").length).toBe(1);
});
