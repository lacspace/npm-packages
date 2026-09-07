import { test, expect } from "vitest";
import {
  PaperAccount,
  flatCommission,
  percentCommission,
  perShareCommission,
  composeCosts,
  fixedSlippage,
  percentSlippage,
} from "./index";

test("flatCommission deducts a fixed amount per fill", () => {
  const acct = new PaperAccount({ cash: 100_000, charges: flatCommission(5) });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 }); // 1000 stock + 5 commission
  expect(acct.totalCharges).toBe(5);
  expect(acct.cash).toBe(100_000 - 1000 - 5);
});

test("percentCommission honours the minimum floor", () => {
  const acct = new PaperAccount({ cash: 100_000, charges: percentCommission(0.03, { min: 1 }) });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 }); // 0.03% of 1000 = 0.30 → floored to 1
  expect(acct.totalCharges).toBe(1);
});

test("percentCommission honours the maximum cap", () => {
  const acct = new PaperAccount({ cash: 1_000_000, charges: percentCommission(1, { max: 20 }) });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 100 }); // 1% of 10000 = 100 → capped to 20
  expect(acct.totalCharges).toBe(20);
});

test("perShareCommission charges per unit", () => {
  const acct = new PaperAccount({ cash: 100_000, charges: perShareCommission(0.1) });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 }); // 0.1 × 10 = 1
  expect(acct.totalCharges).toBe(1);
});

test("composeCosts sums multiple cost models", () => {
  const acct = new PaperAccount({
    cash: 100_000,
    charges: composeCosts(flatCommission(2), percentCommission(0.1)), // 2 + 0.1% of 1000 = 2 + 1
  });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  expect(acct.totalCharges).toBeCloseTo(3, 6);
});

test("fixed slippage moves a buy fill against the taker (integer-safe)", () => {
  const acct = new PaperAccount({ cash: 100_000, slippage: fixedSlippage(2) });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 10 }); // fills at 102, not 100
  expect(o.filledPrice).toBe(102);
  expect(acct.cash).toBe(100_000 - 1020);
});

test("percent slippage reduces a sell fill for the taker", () => {
  const acct = new PaperAccount({ cash: 100_000, slippage: percentSlippage(1) });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 }); // buy fills at 101
  const s = acct.sell("ABC", { qty: 10 }); // sell fills at 99
  expect(s.filledPrice).toBe(99);
});
