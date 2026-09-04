import { test, expect } from "vitest";
import { NepaliDate, adToBs, bsToAd, BS_MIN_YEAR, BS_MAX_YEAR } from "./index";

test("bsToAd known anchor: BS 2080-01-01 -> AD 2023-04-14", () => {
  const ad = bsToAd(2080, 1, 1);
  expect(ad.getFullYear()).toBe(2023);
  expect(ad.getMonth()).toBe(3); // April (0-based)
  expect(ad.getDate()).toBe(14);
});

test("bsToAd known anchor: BS 2000-01-01 -> AD 1943-04-14", () => {
  const ad = bsToAd(2000, 1, 1);
  expect(ad.getFullYear()).toBe(1943);
  expect(ad.getMonth()).toBe(3);
  expect(ad.getDate()).toBe(14);
});

test("adToBs known anchor: AD 2024-04-13 -> BS 2081-01-01", () => {
  const bs = new NepaliDate(new Date(2024, 3, 13));
  expect(bs.format("YYYY-MM-DD")).toBe("2081-01-01");
});

test("round-trip AD -> BS -> AD for several dates", () => {
  const dates = [
    new Date(2023, 0, 1),
    new Date(2000, 5, 15),
    new Date(2024, 3, 13),
    new Date(1990, 11, 31),
    new Date(2030, 2, 20),
  ];
  for (const d0 of dates) {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
    const bs = adToBs(d);
    const back = bsToAd(bs.year, bs.month, bs.day);
    expect(back.getFullYear()).toBe(d.getFullYear());
    expect(back.getMonth()).toBe(d.getMonth());
    expect(back.getDate()).toBe(d.getDate());
  }
});

test("out-of-range BS year throws RangeError", () => {
  expect(() => bsToAd(BS_MIN_YEAR - 1, 1, 1)).toThrow(RangeError);
  expect(() => bsToAd(BS_MAX_YEAR + 1, 1, 1)).toThrow(RangeError);
});

test("AD before supported range throws RangeError", () => {
  expect(() => adToBs(new Date(1900, 0, 1))).toThrow(RangeError);
});

test("invalid month/day throws RangeError", () => {
  expect(() => bsToAd(2080, 13, 1)).toThrow(RangeError);
  expect(() => bsToAd(2080, 1, 40)).toThrow(RangeError);
});
