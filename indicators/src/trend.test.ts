import { test, expect } from "vitest";
import {
  DEMA,
  TEMA,
  ParabolicSAR,
  Ichimoku,
  dema,
  tema,
  parabolicSAR,
  ichimoku,
} from "./index";
import type { HLC } from "./index";

test("DEMA/TEMA equal the constant on a flat series", () => {
  const flat = new Array(30).fill(7);
  const d = dema(flat, 5);
  const t = tema(flat, 5);
  expect(d[0]).toBe(null); // warm-up
  expect(d[d.length - 1]).toBeCloseTo(7, 9);
  expect(t[t.length - 1]).toBeCloseTo(7, 9);
});

test("DEMA warms up after 2*period-1 samples", () => {
  const out = dema([1, 2, 3, 4, 5, 6, 7, 8], 2); // first value at index 2*2-2 = 2
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  expect(typeof out[2]).toBe("number");
});

test("TEMA warms up after 3*period-2 samples", () => {
  const out = tema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2); // first at index 3*2-3 = 3
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  expect(out[2]).toBe(null);
  expect(typeof out[3]).toBe("number");
});

test("DEMA streaming equals batch", () => {
  const vals = [1, 3, 2, 5, 4, 6, 7, 5, 8, 9, 10, 8];
  const batch = dema(vals, 3);
  const s = new DEMA(3);
  const stream = vals.map((v) => s.next(v));
  expect(stream).toEqual(batch);
});

test("Parabolic SAR flips direction on a trend reversal", () => {
  const up: HLC[] = [
    { high: 10, low: 9, close: 9.5 },
    { high: 11, low: 10, close: 10.8 },
    { high: 12, low: 11, close: 11.8 },
    { high: 13, low: 12, close: 12.8 },
    { high: 14, low: 13, close: 13.8 },
  ];
  const down: HLC[] = [
    { high: 13, low: 12, close: 12.2 },
    { high: 11, low: 10, close: 10.2 },
    { high: 9, low: 8, close: 8.2 },
    { high: 7, low: 6, close: 6.2 },
  ];
  const out = parabolicSAR([...up, ...down]).filter((v) => v !== null);
  expect(out[0]!.direction).toBe(1); // established long
  // during the uptrend, SAR sits below the low
  expect(out[1]!.value).toBeLessThanOrEqual(up[1]!.low);
  // by the end of the downtrend it has flipped short
  expect(out[out.length - 1]!.direction).toBe(-1);
});

test("Parabolic SAR streaming equals batch", () => {
  const bars: HLC[] = Array.from({ length: 20 }, (_, i) => ({
    high: 10 + Math.sin(i / 2) * 3 + 2,
    low: 10 + Math.sin(i / 2) * 3 - 2,
    close: 10 + Math.sin(i / 2) * 3,
  }));
  const batch = parabolicSAR(bars);
  const s = new ParabolicSAR();
  const stream = bars.map((b) => s.next(b));
  expect(stream).toEqual(batch);
});

test("Ichimoku returns null until the span-B window fills, then all four lines", () => {
  const bars: HLC[] = Array.from({ length: 60 }, (_, i) => ({
    high: 100 + i + 1,
    low: 100 + i - 1,
    close: 100 + i,
  }));
  const out = ichimoku(bars);
  expect(out[50]).toBe(null); // < 52 bars
  const v = out[59]!;
  expect(v).not.toBeNull();
  // on a straight ramp, conversion = midpoint of last 9 bars' highs/lows
  // last bar i=59: highs 51..60 range covering last 9 → conversion:
  expect(v.conversion).toBeCloseTo((160 + 150) / 2, 6); // (high@59 + low@51)/2
  expect(v.spanA).toBeCloseTo((v.conversion + v.base) / 2, 9);
});

test("Ichimoku streaming equals batch", () => {
  const bars: HLC[] = Array.from({ length: 70 }, (_, i) => ({
    high: 100 + Math.sin(i / 4) * 10 + 1,
    low: 100 + Math.sin(i / 4) * 10 - 1,
    close: 100 + Math.sin(i / 4) * 10,
  }));
  const batch = ichimoku(bars);
  const s = new Ichimoku();
  const stream = bars.map((b) => s.next(b));
  expect(stream).toEqual(batch);
});

test("period validation still throws", () => {
  expect(() => new DEMA(0)).toThrow(RangeError);
  expect(() => new TEMA(-1)).toThrow(RangeError);
  expect(() => new ParabolicSAR(0)).toThrow(RangeError);
});
