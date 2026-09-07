import { test, expect } from "vitest";
import { PaperAccount } from "./index";

const clock = () => {
  let t = 0;
  return () => ++t;
};

test("limit buy fills via processTick when price crosses down", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 5, price: 95 });
  expect(o.status).toBe("OPEN");
  expect(o.type).toBe("LIMIT");
  const filled = acct.processTick("ABC", 94);
  expect(o.status).toBe("FILLED");
  expect(o.filledPrice).toBe(94); // min(94, 95)
  expect(filled).toContain(o);
});

test("stop (SL) sell triggers and fills via processTick", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  const s = acct.sell("ABC", { qty: 10, triggerPrice: 95 });
  expect(s.type).toBe("SL");
  expect(s.status).toBe("OPEN");
  acct.processTick("ABC", 94); // 94 <= 95 → triggers, fills at 94
  expect(s.status).toBe("FILLED");
  expect(s.filledPrice).toBe(94);
});

test("stop-limit triggers then rests as a limit and never fills below the limit", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  const sl = acct.sell("ABC", { qty: 10, triggerPrice: 95, limitPrice: 94 });
  expect(sl.type).toBe("SL-LIMIT");
  acct.processTick("ABC", 92); // triggers (92<=95) → LIMIT sell @94, but 92 < 94 → no fill
  expect(sl.status).toBe("OPEN");
  expect(sl.type).toBe("LIMIT");
  acct.processTick("ABC", 95); // 95 >= 94 → fills at max(95, 94) = 95
  expect(sl.status).toBe("FILLED");
  expect(sl.filledPrice).toBe(95);
});

test("trailing-stop sell trails the high and fills on the pullback", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  const ts = acct.sell("ABC", { qty: 10, trail: 5 });
  expect(ts.type).toBe("TRAILING-SL");
  acct.processTick("ABC", 120); // ref→120, trigger 115, 120>115 → hold
  expect(ts.status).toBe("OPEN");
  acct.processTick("ABC", 116); // ref stays 120, trigger 115 → hold
  expect(ts.status).toBe("OPEN");
  acct.processTick("ABC", 114); // 114 <= 115 → fill at 114
  expect(ts.status).toBe("FILLED");
  expect(ts.filledPrice).toBe(114);
});

test("trailing-stop buy (to cover a short) trails the low and fills on the bounce", () => {
  const acct = new PaperAccount({ cash: 100_000, allowShort: true, now: clock() });
  acct.mark("ABC", 100);
  acct.sell("ABC", { qty: 10 }); // open short at 100
  const tb = acct.buy("ABC", { qty: 10, trail: 5 });
  acct.processTick("ABC", 90); // ref→90, trigger 95, 90>=95 false → hold
  expect(tb.status).toBe("OPEN");
  acct.processTick("ABC", 96); // ref stays 90, trigger 95, 96>=95 → fill at 96
  expect(tb.status).toBe("FILLED");
  expect(tb.filledPrice).toBe(96);
});

test("IOC order that cannot fill immediately is cancelled, not rested", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 5, price: 90, tif: "IOC" }); // limit 90 < 100
  expect(o.status).toBe("CANCELLED");
  expect(o.reason).toMatch(/IOC/);
  expect(acct.openOrders.length).toBe(0);
});

test("FOK order that cannot fill immediately is cancelled", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  const o = acct.sell("ABC", { qty: 5, price: 110, tif: "FOK", triggerPrice: undefined });
  expect(o.status).toBe("CANCELLED");
  expect(o.reason).toMatch(/FOK/);
});

test("DAY orders are cleared by endSession()", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 5, price: 90, tif: "DAY" });
  expect(o.status).toBe("OPEN");
  const expired = acct.endSession();
  expect(o.status).toBe("CANCELLED");
  expect(expired).toContain(o);
  expect(o.reason).toMatch(/DAY/);
});

test("IOC market buy partially fills to the cash available and cancels the rest", () => {
  const acct = new PaperAccount({ cash: 250, now: clock() });
  acct.mark("ABC", 100);
  const o = acct.buy("ABC", { qty: 5, tif: "IOC" }); // wants 500 of stock, has 250
  expect(o.status).toBe("CANCELLED"); // partial
  expect(o.filledQty).toBe(2);
  expect(acct.getPositions()[0]!.qty).toBe(2);
  expect(acct.cash).toBe(50);
});

test("processTick returns [] when nothing crosses", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 5, price: 90 });
  expect(acct.processTick("ABC", 100)).toEqual([]);
});

test("average cost basis is weighted across two buys", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  acct.mark("ABC", 200);
  acct.buy("ABC", { qty: 10 });
  const pos = acct.getPositions()[0]!;
  expect(pos.qty).toBe(20);
  expect(pos.avgPrice).toBeCloseTo(150, 6);
});

test("realized + unrealized are both correct after a partial close of a long", () => {
  const acct = new PaperAccount({ cash: 100_000, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  acct.mark("ABC", 130);
  acct.sell("ABC", { qty: 4 }); // realize (130-100)*4 = 120
  expect(acct.realizedPnl).toBeCloseTo(120, 2);
  acct.mark("ABC", 120); // 6 left @100
  expect(acct.unrealizedPnl).toBeCloseTo(120, 2); // (120-100)*6
});

test("short unrealized P&L carries the right (negative) sign when price rises", () => {
  const acct = new PaperAccount({ cash: 100_000, allowShort: true, now: clock() });
  acct.mark("ABC", 100);
  acct.sell("ABC", { qty: 10 }); // short at 100
  acct.mark("ABC", 110);
  expect(acct.unrealizedPnl).toBeCloseTo(-100, 2); // (110-100) * -10
});

test("serialize → hydrate round-trips positions, orders, pnl and equity curve", () => {
  const acct = new PaperAccount({ cash: 100_000, trackEquity: true, now: clock() });
  acct.mark("ABC", 100);
  acct.buy("ABC", { qty: 10 });
  acct.mark("ABC", 130);
  acct.sell("ABC", { qty: 4 });
  acct.buy("ABC", { qty: 5, price: 80 }); // a resting limit
  const snap = JSON.parse(JSON.stringify(acct.toJSON()));

  const restored = PaperAccount.restore(snap);
  expect(restored.cash).toBe(acct.cash);
  expect(restored.realizedPnl).toBe(acct.realizedPnl);
  expect(restored.getPositions()).toEqual(acct.getPositions());
  expect(restored.openOrders.map((o) => o.id)).toEqual(acct.openOrders.map((o) => o.id));
  expect(restored.equityCurve().length).toBe(acct.equityCurve().length);
  // the restored account keeps ticking
  restored.processTick("ABC", 80);
  expect(restored.getPositions().find((p) => p.symbol === "ABC")!.qty).toBe(11);
});
