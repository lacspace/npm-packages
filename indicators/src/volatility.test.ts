import { test, expect } from "vitest";
import {
  StdDev,
  KeltnerChannels,
  DonchianChannels,
  stddev,
  keltner,
  donchian,
  bollinger,
} from "./index";
import type { HLC } from "./index";

test("StdDev is population sd and matches Bollinger's band math", () => {
  const out = stddev([2, 4, 6], 3);
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  expect(out[2]!).toBeCloseTo(Math.sqrt(8 / 3), 9); // mean 4, var 8/3

  // Bollinger upper - middle = mult * sd (population), so they agree exactly.
  const vals = [10, 12, 11, 13, 14, 12, 15, 16, 14, 13];
  const b = bollinger(vals, 5, 2);
  const sd = stddev(vals, 5);
  for (let i = 0; i < vals.length; i++) {
    if (b[i] === null) {
      expect(sd[i]).toBe(null);
      continue;
    }
    expect(b[i]!.upper - b[i]!.middle).toBeCloseTo(2 * sd[i]!, 9);
  }
});

test("Donchian channels on a 3-bar window", () => {
  const bars = [
    { high: 5, low: 1 },
    { high: 6, low: 2 },
    { high: 4, low: 3 },
  ];
  const out = donchian(bars, 3);
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  expect(out[2]).toEqual({ upper: 6, lower: 1, middle: 3.5 });
});

test("Keltner middle band equals EMA of close; upper>middle>lower", () => {
  const bars: HLC[] = Array.from({ length: 40 }, (_, i) => ({
    high: 100 + Math.sin(i / 3) * 5 + 2,
    low: 100 + Math.sin(i / 3) * 5 - 2,
    close: 100 + Math.sin(i / 3) * 5,
  }));
  const out = keltner(bars, 20, 2);
  const last = out[out.length - 1]!;
  expect(last).not.toBeNull();
  expect(last.upper).toBeGreaterThan(last.middle);
  expect(last.middle).toBeGreaterThan(last.lower);
  // symmetric envelope
  expect(last.upper - last.middle).toBeCloseTo(last.middle - last.lower, 9);
});

test("volatility indicators: streaming equals batch", () => {
  const bars: HLC[] = Array.from({ length: 40 }, (_, i) => ({
    high: 50 + Math.sin(i / 4) * 6 + 1.5,
    low: 50 + Math.sin(i / 4) * 6 - 1.5,
    close: 50 + Math.sin(i / 4) * 6,
  }));
  const closes = bars.map((b) => b.close);

  const sdS = new StdDev(10);
  expect(closes.map((c) => sdS.next(c))).toEqual(stddev(closes, 10));

  const kS = new KeltnerChannels(20, 2);
  expect(bars.map((b) => kS.next(b))).toEqual(keltner(bars, 20, 2));

  const dS = new DonchianChannels(20);
  expect(bars.map((b) => dS.next(b))).toEqual(donchian(bars, 20));
});
