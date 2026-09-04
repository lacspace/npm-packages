import { test, expect } from "vitest";
import { sma, ema, rsi, macd, SMA, EMA, RSI } from "./index";

test("SMA on a known series", () => {
  expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  const s = new SMA(2);
  expect(s.next(10)).toBe(null);
  expect(s.next(20)).toBe(15);
  expect(s.next(30)).toBe(25);
});

test("EMA warms up with an SMA seed then tracks", () => {
  const out = ema([1, 2, 3, 4, 5], 2);
  expect(out[0]).toBe(null); // warm-up
  expect(out[1]).toBeCloseTo(1.5, 6); // SMA seed of first 2
  // k = 2/(2+1); next = 3*k + 1.5*(1-k)
  expect(out[2]).toBeCloseTo(3 * (2 / 3) + 1.5 * (1 / 3), 6);
  expect(typeof out[out.length - 1]).toBe("number");

  const e = new EMA(3);
  [1, 2, 3, 4, 5, 6].forEach((v) => e.next(v));
  expect(typeof e.value).toBe("number");
});

test("RSI on the classic Wilder series is ~70.5", () => {
  const prices = [
    44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245,
    45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282,
  ];
  const out = rsi(prices, 14);
  const first = out.find((v) => v !== null)!;
  expect(first).toBeGreaterThan(69);
  expect(first).toBeLessThan(72);
});

test("RSI on a totally flat series returns 50 (not 100)", () => {
  const flat = new Array(30).fill(100);
  const out = rsi(flat, 14);
  const last = out[out.length - 1];
  expect(last).toBe(50);
});

test("RSI class instance also neutral on flat input", () => {
  const r = new RSI(14);
  let last: number | null = null;
  for (let i = 0; i < 30; i++) last = r.next(50);
  expect(last).toBe(50);
});

test("MACD produces numeric line/signal after warm-up", () => {
  const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
  const out = macd(values);
  const last = out[out.length - 1];
  expect(last).not.toBeNull();
  expect(typeof last!.macd).toBe("number");
  expect(typeof last!.signal).toBe("number");
  expect(Number.isFinite(last!.histogram)).toBe(true);
});
