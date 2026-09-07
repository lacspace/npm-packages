import { test, expect } from "vitest";
import { resampleCandles, detectGaps, vwap, typicalPrice, type Candle } from "./ohlcv";

const M = 60_000; // one minute in ms

test("resampleCandles aggregates 1m bars into a single 5m bar", () => {
  const bars: Candle[] = [
    { time: 0 * M, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 1 * M, open: 11, high: 15, low: 10, close: 14, volume: 200 },
    { time: 2 * M, open: 14, high: 14, low: 8, close: 9, volume: 150 },
    { time: 3 * M, open: 9, high: 13, low: 9, close: 12, volume: 50 },
    { time: 4 * M, open: 12, high: 16, low: 11, close: 13, volume: 300 },
  ];
  const out = resampleCandles(bars, 5 * M);
  expect(out).toHaveLength(1);
  expect(out[0]).toEqual({
    time: 0,
    open: 10, // first open
    high: 16, // max high
    low: 8, // min low
    close: 13, // last close
    volume: 800, // summed
  });
});

test("resampleCandles splits into separate higher-timeframe buckets", () => {
  const bars: Candle[] = [
    { time: 0 * M, open: 1, high: 2, low: 1, close: 2, volume: 10 },
    { time: 4 * M, open: 2, high: 3, low: 2, close: 3, volume: 10 },
    { time: 5 * M, open: 3, high: 5, low: 3, close: 4, volume: 20 },
    { time: 9 * M, open: 4, high: 6, low: 1, close: 5, volume: 20 },
  ];
  const out = resampleCandles(bars, 5 * M);
  expect(out).toHaveLength(2);
  expect(out[0]!.time).toBe(0);
  expect(out[0]!.close).toBe(3);
  expect(out[1]!.time).toBe(5 * M);
  expect(out[1]!.high).toBe(6);
  expect(out[1]!.low).toBe(1);
  expect(out[1]!.volume).toBe(40);
});

test("resampleCandles sorts unordered input and handles empty", () => {
  const bars: Candle[] = [
    { time: 2 * M, open: 3, high: 3, low: 3, close: 3 },
    { time: 0 * M, open: 1, high: 1, low: 1, close: 1 },
  ];
  const out = resampleCandles(bars, 5 * M);
  expect(out[0]!.open).toBe(1); // earliest bar's open wins after sort
  expect(out[0]!.close).toBe(3);
  expect(resampleCandles([], 5 * M)).toEqual([]);
});

test("detectGaps finds a single missing bar", () => {
  const bars: Candle[] = [
    { time: 0 * M, open: 1, high: 1, low: 1, close: 1 },
    { time: 1 * M, open: 1, high: 1, low: 1, close: 1 },
    { time: 3 * M, open: 1, high: 1, low: 1, close: 1 }, // 2M missing
  ];
  const gaps = detectGaps(bars, M);
  expect(gaps).toEqual([{ from: 1 * M, to: 3 * M, missing: 1 }]);
});

test("detectGaps reports none for a contiguous series", () => {
  const bars: Candle[] = [
    { time: 0, open: 1, high: 1, low: 1, close: 1 },
    { time: M, open: 1, high: 1, low: 1, close: 1 },
    { time: 2 * M, open: 1, high: 1, low: 1, close: 1 },
  ];
  expect(detectGaps(bars, M)).toEqual([]);
});

test("vwap weights typical price by volume", () => {
  const bars: Candle[] = [
    { time: 0, open: 9, high: 10, low: 8, close: 9, volume: 100 }, // tp = 9
    { time: M, open: 11, high: 12, low: 10, close: 11, volume: 300 }, // tp = 11
  ];
  // (9*100 + 11*300) / 400 = 4200 / 400
  expect(vwap(bars)).toBeCloseTo(10.5, 10);
});

test("vwap returns 0 when there is no volume", () => {
  const bars: Candle[] = [{ time: 0, open: 1, high: 2, low: 0, close: 1 }];
  expect(vwap(bars)).toBe(0);
  expect(vwap([])).toBe(0);
});

test("typicalPrice averages high/low/close", () => {
  expect(typicalPrice({ time: 0, open: 5, high: 12, low: 6, close: 9 })).toBe(9);
});
