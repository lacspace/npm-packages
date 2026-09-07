import { test, expect } from "vitest";
import {
  StochRSI,
  CCI,
  WilliamsR,
  ROC,
  MFI,
  stochRSI,
  cci,
  williamsR,
  roc,
  mfi,
} from "./index";
import type { HLC } from "./index";

const flat = (n: number, k: number, v = 0) =>
  Array.from({ length: n }, () => ({ high: k, low: k, close: k, volume: v }));

test("Williams %R on a known 3-bar window is -50", () => {
  const bars: HLC[] = [
    { high: 10, low: 8, close: 9 },
    { high: 12, low: 9, close: 11 },
    { high: 11, low: 10, close: 10 },
  ];
  const out = williamsR(bars, 3);
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  // hh=12, ll=8, close=10 → (12-10)/(12-8)*-100 = -50
  expect(out[2]).toBeCloseTo(-50, 9);
});

test("ROC computes percent change vs n bars ago", () => {
  const out = roc([10, 11, 12, 13], 2);
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  expect(out[2]).toBeCloseTo(20, 9); // (12-10)/10*100
  expect(out[3]!).toBeCloseTo((13 - 11) / 11 * 100, 9);
});

test("CCI on a controlled TP ramp equals +100", () => {
  const bars: HLC[] = [
    { high: 1, low: 1, close: 1 },
    { high: 2, low: 2, close: 2 },
    { high: 3, low: 3, close: 3 },
  ];
  const out = cci(bars, 3);
  expect(out[0]).toBe(null);
  // TP=[1,2,3], mean=2, meanDev=(1+0+1)/3, CCI=(3-2)/(0.015*0.6667)=100
  expect(out[2]).toBeCloseTo(100, 6);
});

test("MFI on an up/down/up flow series", () => {
  const bars = [
    { high: 1, low: 1, close: 1, volume: 100 },
    { high: 2, low: 2, close: 2, volume: 100 }, // up  → +200
    { high: 1, low: 1, close: 1, volume: 100 }, // down → -100
    { high: 2, low: 2, close: 2, volume: 100 }, // up  → +200
  ];
  const out = mfi(bars, 2);
  expect(out[0]).toBe(null);
  expect(out[1]).toBe(null);
  // window {pos200, neg100} → ratio 2 → 100 - 100/3
  expect(out[2]!).toBeCloseTo(100 - 100 / 3, 6);
  expect(out[3]!).toBeCloseTo(100 - 100 / 3, 6);
});

test("MFI is neutral 50 on a flat series", () => {
  const out = mfi(flat(30, 100, 1000), 14);
  expect(out[out.length - 1]).toBe(50);
});

test("StochRSI stays within 0..100 and streaming equals batch", () => {
  const vals = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 8 + i * 0.1);
  const batch = stochRSI(vals);
  const s = new StochRSI();
  const stream = vals.map((v) => s.next(v));
  expect(stream).toEqual(batch);
  const eps = 1e-9;
  for (const v of batch) {
    if (v === null) continue;
    expect(v.k).toBeGreaterThanOrEqual(-eps);
    expect(v.k).toBeLessThanOrEqual(100 + eps);
    expect(v.stochRSI).toBeGreaterThanOrEqual(-eps);
    expect(v.stochRSI).toBeLessThanOrEqual(100 + eps);
  }
});

test("CCI / Williams / ROC streaming equals batch", () => {
  const bars: HLC[] = Array.from({ length: 40 }, (_, i) => ({
    high: 50 + Math.sin(i / 3) * 5 + 1,
    low: 50 + Math.sin(i / 3) * 5 - 1,
    close: 50 + Math.sin(i / 3) * 5,
  }));
  const closes = bars.map((b) => b.close);

  const cciS = new CCI(20);
  expect(bars.map((b) => cciS.next(b))).toEqual(cci(bars, 20));

  const wS = new WilliamsR(14);
  expect(bars.map((b) => wS.next(b))).toEqual(williamsR(bars, 14));

  const rS = new ROC(12);
  expect(closes.map((c) => rS.next(c))).toEqual(roc(closes, 12));
});

test("MFI streaming equals batch", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    high: 50 + Math.sin(i / 3) * 5 + 1,
    low: 50 + Math.sin(i / 3) * 5 - 1,
    close: 50 + Math.sin(i / 3) * 5,
    volume: 1000 + i * 10,
  }));
  const s = new MFI(14);
  expect(bars.map((b) => s.next(b))).toEqual(mfi(bars, 14));
});
