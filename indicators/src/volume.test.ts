import { test, expect } from "vitest";
import {
  OBV,
  AccumulationDistribution,
  ChaikinMoneyFlow,
  obv,
  adl,
  cmf,
} from "./index";
import type { HLCV } from "./index";

test("OBV adds on up-close, subtracts on down-close, holds on unchanged", () => {
  const bars = [
    { close: 10, volume: 100 },
    { close: 11, volume: 150 }, // up → +150
    { close: 10, volume: 120 }, // down → -120
    { close: 10, volume: 80 }, // flat → unchanged
  ];
  expect(obv(bars)).toEqual([0, 150, 30, 30]);
});

test("A/D line accumulates money-flow volume", () => {
  const bars: HLCV[] = [
    { high: 10, low: 0, close: 10, volume: 100 }, // MFM=+1 → +100
    { high: 10, low: 0, close: 0, volume: 100 }, // MFM=-1 → -100
  ];
  expect(adl(bars)).toEqual([100, 0]);
});

test("CMF over a window; zero when accumulation cancels distribution", () => {
  const bars: HLCV[] = [
    { high: 10, low: 0, close: 10, volume: 100 }, // MFV +100
    { high: 10, low: 0, close: 0, volume: 100 }, // MFV -100
  ];
  const out = cmf(bars, 2);
  expect(out[0]).toBe(null);
  expect(out[1]).toBeCloseTo(0, 9); // (100-100)/(200)
});

test("CMF stays within -1..1 and streaming equals batch", () => {
  const bars: HLCV[] = Array.from({ length: 40 }, (_, i) => ({
    high: 50 + Math.sin(i / 3) * 5 + 1,
    low: 50 + Math.sin(i / 3) * 5 - 1,
    close: 50 + Math.sin(i / 3) * 5 + Math.cos(i / 2) * 0.5,
    volume: 1000 + i * 25,
  }));
  const batch = cmf(bars, 20);
  const s = new ChaikinMoneyFlow(20);
  const stream = bars.map((b) => s.next(b));
  expect(stream).toEqual(batch);
  for (const v of batch) {
    if (v === null) continue;
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  }
});

test("OBV / A/D streaming equals batch, and reset() clears state", () => {
  const bars: HLCV[] = Array.from({ length: 30 }, (_, i) => ({
    high: 50 + Math.sin(i / 3) * 5 + 1,
    low: 50 + Math.sin(i / 3) * 5 - 1,
    close: 50 + Math.sin(i / 3) * 5,
    volume: 1000 + i * 10,
  }));
  const oS = new OBV();
  expect(bars.map((b) => oS.next(b))).toEqual(obv(bars));

  const aS = new AccumulationDistribution();
  expect(bars.map((b) => aS.next(b))).toEqual(adl(bars));

  aS.reset();
  expect(aS.value).toBe(null);
  expect(aS.next(bars[0]!)).toBeCloseTo(adl([bars[0]!])[0]!, 9);
});
