import { test, expect } from "vitest";
import {
  PRESETS,
  NYSE,
  NASDAQ,
  LSE,
  TSE,
  HKEX,
  SGX,
  createClock,
  MarketClock,
} from "./index";

test("PRESETS exposes all built-in exchanges as valid specs", () => {
  const names = ["NSE", "BSE", "NYSE", "NASDAQ", "LSE", "TSE", "HKEX", "SGX"];
  expect(Object.keys(PRESETS).sort()).toEqual(names.slice().sort());
  for (const key of Object.keys(PRESETS)) {
    const spec = PRESETS[key as keyof typeof PRESETS];
    expect(spec.regular.open).toMatch(/^\d\d:\d\d$/);
    expect(spec.regular.close).toMatch(/^\d\d:\d\d$/);
    expect(Array.isArray(spec.weekend)).toBe(true);
    expect(Array.isArray(spec.holidays)).toBe(true);
    // every preset must be constructable
    expect(() => createClock(spec)).not.toThrow();
  }
});

test("NASDAQ mirrors NYSE sessions but keeps its own name", () => {
  expect(NASDAQ.regular).toEqual(NYSE.regular);
  expect(NASDAQ.name).toBe("NASDAQ");
  expect(NYSE.name).toBe("NYSE");
});

test("NYSE is DST-correct: open during EDT summer session", () => {
  const nyse = new MarketClock(NYSE);
  // 2025-06-16 (Mon) 10:00 EDT = 14:00 UTC (UTC-4 in summer).
  expect(nyse.isOpen(new Date(Date.UTC(2025, 5, 16, 14, 0)))).toBe(true);
  // 10:00 EST in winter = 15:00 UTC (UTC-5). Confirm the offset really shifts.
  expect(nyse.isOpen(new Date(Date.UTC(2025, 0, 6, 15, 0)))).toBe(true);
  expect(nyse.isOpen(new Date(Date.UTC(2025, 0, 6, 14, 0)))).toBe(false);
});

test("no-DST Asian presets use exact fixed offsets", () => {
  expect(TSE.timeZone).toBeUndefined();
  expect(TSE.offsetMinutes).toBe(540);
  expect(HKEX.offsetMinutes).toBe(480);
  expect(SGX.offsetMinutes).toBe(480);
  const sgx = new MarketClock(SGX);
  // 2025-06-16 (Mon) 10:00 SGT = 02:00 UTC.
  expect(sgx.isOpen(new Date(Date.UTC(2025, 5, 16, 2, 0)))).toBe(true);
});

test("LSE opening auction is a pre-open segment", () => {
  const lse = new MarketClock(LSE);
  // 2025-06-16 (Mon) 07:55 BST = 06:55 UTC (UTC+1 summer).
  expect(lse.currentSegment(new Date(Date.UTC(2025, 5, 16, 6, 55)))).toBe("pre-open");
  // 09:00 BST = 08:00 UTC → regular.
  expect(lse.currentSegment(new Date(Date.UTC(2025, 5, 16, 8, 0)))).toBe("regular");
});
