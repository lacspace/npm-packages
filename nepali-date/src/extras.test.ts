import { test, expect } from "vitest";
import {
  NepaliDate,
  bsToAd,
  adToBs,
  daysInBsMonth,
  bsYearLength,
  bsMonthName,
  bsWeekdayName,
  bsWeekday,
  bsWeekOfMonth,
  bsFiscalYear,
  bsFiscalYearLabel,
  diffDays,
  startOfBsMonth,
  endOfBsMonth,
  parseBs,
  tryParseBs,
  ordinal,
  formatBs,
  BS_MIN_YEAR,
  BS_MAX_YEAR,
} from "./index";

/* ---- conversion outputs must stay LOCKED (unchanged by this minor) ---- */

test("LOCK: bsToAd(2081,1,1) === AD 2024-04-13 (unchanged)", () => {
  const d = bsToAd(2081, 1, 1);
  expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2024, 4, 13]);
});

test("LOCK: adToBs(2024-04-13) === BS 2081-01-01 (unchanged)", () => {
  expect(adToBs(new Date(2024, 3, 13))).toEqual({ year: 2081, month: 1, day: 1 });
});

test("LOCK: bsToAd(2080,1,1) === AD 2023-04-14 (unchanged)", () => {
  const d = bsToAd(2080, 1, 1);
  expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2023, 4, 14]);
});

/* ---- formatter tokens + Nepali digits ---- */

test("formatBs default and slash pattern", () => {
  expect(formatBs({ year: 2081, month: 1, day: 5 })).toBe("2081-01-05");
  expect(formatBs({ year: 2081, month: 1, day: 5 }, "YYYY/MM/DD")).toBe("2081/01/05");
});

test("formatBs month name, weekday and ordinal tokens", () => {
  // 2081-01-15 falls on a Saturday (verified via bsToAd: 2081-01-01 = 2024-04-13, a Saturday)
  const out = formatBs({ year: 2081, month: 1, day: 15 }, "Do MMMM YYYY, dddd");
  expect(out).toBe("15th Baisakh 2081, Saturday");
});

test("formatBs Nepali toggle renders Devanagari digits + Nepali names", () => {
  const out = formatBs({ year: 2081, month: 1, day: 15 }, "YYYY MMMM D, dddd", { nepali: true });
  expect(out).toBe("२०८१ बैशाख १५, शनिबार");
  expect(formatBs({ year: 2081, month: 1, day: 5 }, "YYYY/MM/DD", { nepali: true })).toBe(
    "२०८१/०१/०५",
  );
});

test("ordinal helper", () => {
  expect(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "32nd"]).toEqual([
    ordinal(1), ordinal(2), ordinal(3), ordinal(4), ordinal(11), ordinal(12),
    ordinal(13), ordinal(21), ordinal(22), ordinal(32),
  ]);
});

test("NepaliDate.ordinal() method", () => {
  expect(NepaliDate.fromBS(2081, 1, 21).ordinal()).toBe("21st");
});

/* ---- arithmetic + clamping ---- */

test("diffDays between BS dates", () => {
  expect(diffDays({ year: 2081, month: 1, day: 15 }, { year: 2081, month: 1, day: 1 })).toBe(14);
  // Baisakh 2081 has 31 days, so 2081-02-01 is 31 days after 2081-01-01
  expect(diffDays({ year: 2081, month: 2, day: 1 }, { year: 2081, month: 1, day: 1 })).toBe(
    daysInBsMonth(2081, 1),
  );
  expect(diffDays({ year: 2081, month: 1, day: 1 }, { year: 2081, month: 1, day: 15 })).toBe(-14);
});

test("addMonths clamps day to shorter target month", () => {
  // Start on day 32 of a 32-day month (Jestha 2081), add a month landing on a 31-day month (Ashadh).
  const src = NepaliDate.fromBS(2081, 2, 32); // Jestha 2081 has 32 days
  expect(daysInBsMonth(2081, 2)).toBe(32);
  expect(daysInBsMonth(2081, 3)).toBe(31);
  const next = src.addMonths(1); // Ashadh
  expect(next.getMonth()).toBe(3);
  expect(next.getDate()).toBe(Math.min(32, daysInBsMonth(2081, 3))); // clamped 32 -> 31
  expect(next.getDate()).toBe(31);
});

test("startOf/endOf month via helpers and methods", () => {
  const bs = { year: 2081, month: 1, day: 15 };
  expect(startOfBsMonth(bs)).toEqual({ year: 2081, month: 1, day: 1 });
  expect(endOfBsMonth(bs)).toEqual({ year: 2081, month: 1, day: daysInBsMonth(2081, 1) });
  const d = NepaliDate.fromBS(2081, 1, 15);
  expect(d.startOf("month").toString()).toBe("2081-01-01");
  expect(d.endOf("month").getDate()).toBe(daysInBsMonth(2081, 1));
  expect(d.startOf("year").toString()).toBe("2081-01-01");
  expect(d.endOf("year").getMonth()).toBe(12);
});

/* ---- parsing valid/invalid ---- */

test("parseBs accepts Arabic and Devanagari, various separators", () => {
  expect(parseBs("2081-03-15")).toEqual({ year: 2081, month: 3, day: 15 });
  expect(parseBs("२०८१/०३/१५")).toEqual({ year: 2081, month: 3, day: 15 });
  expect(parseBs("2081.3.5")).toEqual({ year: 2081, month: 3, day: 5 });
});

test("parseBs rejects impossible days and bad shapes", () => {
  expect(() => parseBs("2081-01-40")).toThrow(RangeError); // no month has 40 days
  expect(() => parseBs("2081-13-01")).toThrow(RangeError); // month out of range
  expect(() => parseBs(String(BS_MAX_YEAR + 1) + "-01-01")).toThrow(RangeError); // year out of range
  expect(() => parseBs("not a date")).toThrow();
});

test("tryParseBs returns null instead of throwing", () => {
  expect(tryParseBs("2081-03-15")).toEqual({ year: 2081, month: 3, day: 15 });
  expect(tryParseBs("garbage")).toBeNull();
  expect(tryParseBs("2081-01-40")).toBeNull();
});

/* ---- calendar helpers ---- */

test("daysInBsMonth and range guards", () => {
  expect(daysInBsMonth(2081, 1)).toBe(31);
  expect(() => daysInBsMonth(BS_MIN_YEAR - 1, 1)).toThrow(RangeError);
  expect(() => daysInBsMonth(2081, 0)).toThrow(RangeError);
  expect(() => daysInBsMonth(2081, 13)).toThrow(RangeError);
});

test("bsYearLength sums to 365 or 366", () => {
  const len = bsYearLength(2081);
  expect(len === 365 || len === 366).toBe(true);
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += daysInBsMonth(2081, m);
  expect(len).toBe(sum);
});

test("bsMonthName and bsWeekdayName in both languages", () => {
  expect(bsMonthName(1)).toBe("Baisakh");
  expect(bsMonthName(1, { nepali: true })).toBe("बैशाख");
  expect(bsMonthName(12)).toBe("Chaitra");
  expect(bsWeekdayName(0)).toBe("Sunday");
  expect(bsWeekdayName(6, { nepali: true })).toBe("शनिबार");
  expect(() => bsMonthName(13)).toThrow(RangeError);
  expect(() => bsWeekdayName(7)).toThrow(RangeError);
});

test("bsWeekday matches NepaliDate.getDay", () => {
  const bs = { year: 2081, month: 5, day: 20 };
  expect(bsWeekday(bs)).toBe(NepaliDate.fromBS(bs.year, bs.month, bs.day).getDay());
});

test("bsWeekOfMonth and method agree", () => {
  const bs = { year: 2081, month: 1, day: 15 };
  expect(bsWeekOfMonth(bs)).toBe(NepaliDate.fromBS(2081, 1, 15).weekOfMonth());
  expect(bsWeekOfMonth({ year: 2081, month: 1, day: 1 })).toBe(1);
});

/* ---- fiscal year ---- */

test("bsFiscalYear + label (Shrawan–Ashadh)", () => {
  // Baisakh (month 1) is in the FY that started the previous year
  expect(bsFiscalYear({ year: 2081, month: 1, day: 1 })).toEqual({ start: 2080, end: 2081 });
  expect(bsFiscalYearLabel({ year: 2081, month: 1, day: 1 })).toBe("2080/81");
  // Shrawan (month 4) starts the new FY
  expect(bsFiscalYear({ year: 2081, month: 4, day: 1 })).toEqual({ start: 2081, end: 2082 });
  expect(bsFiscalYearLabel({ year: 2081, month: 4, day: 1 })).toBe("2081/82");
  // matches the existing class method
  expect(bsFiscalYearLabel({ year: 2081, month: 4, day: 1 })).toBe(
    NepaliDate.fromBS(2081, 4, 1).fiscalYearLabel(),
  );
});
