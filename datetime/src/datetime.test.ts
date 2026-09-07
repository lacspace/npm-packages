import { describe, it, expect } from "vitest";
import {
  add, subtract, addDays, addMonths, addYears, addHours, subMonths,
  startOf, endOf,
  diff, diffInDays, diffInHours, diffInMonths, diffInYears, difference,
  isBefore, isAfter, isEqual, isSameDay, isSame, min, max, clamp, isBetween, closestTo,
  isLeapYear, daysInMonth, isWeekend, getDayOfYear, getWeekOfYear, getQuarter, isValid,
  format, parse, parseISO, toISO, unix, fromUnix, toDate,
} from "./index.js";

// All fixtures use the local Date constructor (or Date.UTC where an absolute
// instant matters), so every assertion is timezone-agnostic.

describe("arithmetic — add/subtract", () => {
  it("adds days", () => {
    expect(format(addDays(new Date(2021, 0, 1), 5), "YYYY-MM-DD")).toBe("2021-01-06");
  });

  it("is month-overflow-safe (Jan 31 + 1 month = Feb 28 in a common year)", () => {
    expect(format(addMonths(new Date(2021, 0, 31), 1), "YYYY-MM-DD")).toBe("2021-02-28");
  });

  it("is month-overflow-safe into a leap February (Jan 31 + 1 month = Feb 29)", () => {
    expect(format(addMonths(new Date(2020, 0, 31), 1), "YYYY-MM-DD")).toBe("2020-02-29");
  });

  it("clamps Feb 29 when adding a year into a common year", () => {
    expect(format(addYears(new Date(2020, 1, 29), 1), "YYYY-MM-DD")).toBe("2021-02-28");
  });

  it("adds a mixed duration object", () => {
    const r = add(new Date(2021, 0, 1, 0, 0, 0), {
      years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6,
    });
    expect(format(r, "YYYY-MM-DD HH:mm:ss")).toBe("2022-03-04 04:05:06");
  });

  it("adds hours as absolute elapsed time", () => {
    expect(format(addHours(new Date(2021, 0, 1, 22, 0, 0), 5), "YYYY-MM-DD HH:mm")).toBe("2021-01-02 03:00");
  });

  it("subtracts month-overflow-safe (Mar 31 − 1 month = Feb 28)", () => {
    expect(format(subMonths(new Date(2021, 2, 31), 1), "YYYY-MM-DD")).toBe("2021-02-28");
  });

  it("subtract mirrors add", () => {
    const start = new Date(2021, 5, 15, 12, 30);
    const there = add(start, { days: 10, hours: 6 });
    const back = subtract(there, { days: 10, hours: 6 });
    expect(back.getTime()).toBe(start.getTime());
  });

  it("never mutates its input", () => {
    const original = new Date(2021, 0, 1);
    const snapshot = original.getTime();
    add(original, { days: 100 });
    addMonths(original, 5);
    subtract(original, { years: 1 });
    expect(original.getTime()).toBe(snapshot);
  });

  it("returns Invalid Date for invalid input", () => {
    expect(isValid(add("nonsense", { days: 1 }))).toBe(false);
  });
});

describe("startOf / endOf", () => {
  const d = new Date(2021, 5, 15, 13, 45, 30, 500); // Tue 15 Jun 2021

  it("startOf year", () => {
    expect(format(startOf(d, "year"), "YYYY-MM-DD HH:mm:ss.SSS")).toBe("2021-01-01 00:00:00.000");
  });
  it("startOf quarter", () => {
    expect(format(startOf(d, "quarter"), "YYYY-MM-DD")).toBe("2021-04-01");
  });
  it("startOf month", () => {
    expect(format(startOf(d, "month"), "YYYY-MM-DD HH:mm:ss")).toBe("2021-06-01 00:00:00");
  });
  it("startOf day", () => {
    expect(format(startOf(d, "day"), "HH:mm:ss.SSS")).toBe("00:00:00.000");
  });
  it("startOf hour/minute/second", () => {
    expect(format(startOf(d, "hour"), "HH:mm:ss")).toBe("13:00:00");
    expect(format(startOf(d, "minute"), "HH:mm:ss")).toBe("13:45:00");
    expect(format(startOf(d, "second"), "SSS")).toBe("000");
  });
  it("startOf week defaults to Monday", () => {
    expect(format(startOf(d, "week"), "YYYY-MM-DD dddd")).toBe("2021-06-14 Monday");
  });
  it("startOf week honours weekStartsOn: 0 (Sunday)", () => {
    expect(format(startOf(d, "week", { weekStartsOn: 0 }), "YYYY-MM-DD dddd")).toBe("2021-06-13 Sunday");
  });
  it("endOf month lands on the leap-year Feb 29", () => {
    expect(format(endOf(new Date(2020, 1, 10), "month"), "YYYY-MM-DD HH:mm:ss.SSS")).toBe("2020-02-29 23:59:59.999");
  });
  it("endOf year", () => {
    expect(format(endOf(d, "year"), "YYYY-MM-DD HH:mm:ss.SSS")).toBe("2021-12-31 23:59:59.999");
  });
  it("endOf day / quarter", () => {
    expect(format(endOf(d, "day"), "HH:mm:ss.SSS")).toBe("23:59:59.999");
    expect(format(endOf(d, "quarter"), "YYYY-MM-DD")).toBe("2021-06-30");
  });
});

describe("diff", () => {
  const a = Date.UTC(2021, 0, 10, 0, 0, 0);
  const b = Date.UTC(2021, 0, 1, 0, 0, 0);

  it("diff in days (ms-based, DST-agnostic)", () => {
    expect(diffInDays(a, b)).toBe(9);
    expect(diffInDays(b, a)).toBe(-9);
  });
  it("diff in hours truncates toward zero", () => {
    expect(diffInHours(Date.UTC(2021, 0, 1, 5, 30), Date.UTC(2021, 0, 1, 0, 0))).toBe(5);
  });
  it("diff in whole months (calendar-correct)", () => {
    expect(diffInMonths(new Date(2021, 3, 15), new Date(2021, 0, 15))).toBe(3);
    expect(diffInMonths(new Date(2021, 0, 14), new Date(2021, 0, 15))).toBe(0);
  });
  it("diff in whole months does not round up on a short remainder", () => {
    expect(diffInMonths(new Date(2021, 2, 14), new Date(2021, 0, 15))).toBe(1);
  });
  it("diff in years", () => {
    expect(diffInYears(new Date(2025, 5, 1), new Date(2021, 5, 1))).toBe(4);
  });
  it("diff quarter", () => {
    expect(diff(new Date(2021, 9, 1), new Date(2021, 0, 1), "quarter")).toBe(3);
  });
});

describe("difference breakdown", () => {
  it("produces a full calendar breakdown", () => {
    const a = new Date(2020, 0, 1, 0, 0, 0);
    const b = new Date(2021, 2, 10, 5, 30, 15);
    expect(difference(b, a)).toEqual({
      years: 1, months: 2, days: 9, hours: 5, minutes: 30, seconds: 15,
    });
  });
  it("carries the sign of a − b", () => {
    const a = new Date(2020, 0, 1, 0, 0, 0);
    const b = new Date(2021, 2, 10, 5, 30, 15);
    const r = difference(a, b);
    expect(r.years).toBe(-1);
    expect(r.months).toBe(-2);
    expect(r.days).toBe(-9);
  });
});

describe("comparison", () => {
  const early = new Date(2021, 0, 1, 8);
  const late = new Date(2021, 0, 1, 20);

  it("isBefore / isAfter / isEqual", () => {
    expect(isBefore(early, late)).toBe(true);
    expect(isAfter(late, early)).toBe(true);
    expect(isEqual(early, new Date(2021, 0, 1, 8))).toBe(true);
  });
  it("isSameDay / isSame(unit)", () => {
    expect(isSameDay(early, late)).toBe(true);
    expect(isSame(early, new Date(2021, 0, 31), "month")).toBe(true);
    expect(isSame(early, new Date(2022, 0, 1), "year")).toBe(false);
  });
  it("min / max", () => {
    const dates = [new Date(2021, 5, 1), new Date(2020, 0, 1), new Date(2022, 11, 31)];
    expect(min(...dates)!.getFullYear()).toBe(2020);
    expect(max(...dates)!.getFullYear()).toBe(2022);
    expect(min()).toBeUndefined();
  });
  it("clamp", () => {
    const lo = new Date(2021, 0, 1);
    const hi = new Date(2021, 11, 31);
    expect(clamp(new Date(2020, 0, 1), { min: lo, max: hi }).getTime()).toBe(lo.getTime());
    expect(clamp(new Date(2023, 0, 1), { min: lo, max: hi }).getTime()).toBe(hi.getTime());
    expect(clamp(new Date(2021, 5, 1), { min: lo, max: hi }).getTime()).toBe(new Date(2021, 5, 1).getTime());
  });
  it("isBetween with inclusivity", () => {
    const start = new Date(2021, 0, 1);
    const end = new Date(2021, 0, 31);
    expect(isBetween(new Date(2021, 0, 15), start, end)).toBe(true);
    expect(isBetween(start, start, end, "()")).toBe(false);
    expect(isBetween(start, start, end, "[)")).toBe(true);
    expect(isBetween(end, start, end, "(]")).toBe(true);
  });
  it("closestTo", () => {
    const target = new Date(2021, 5, 15);
    const list = [new Date(2021, 0, 1), new Date(2021, 5, 10), new Date(2022, 0, 1)];
    expect(closestTo(target, list)!.getTime()).toBe(new Date(2021, 5, 10).getTime());
  });
});

describe("query", () => {
  it("isLeapYear", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(new Date(2024, 5, 1))).toBe(true);
  });
  it("daysInMonth (both call forms)", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2023, 1)).toBe(28);
    expect(daysInMonth(2021, 3)).toBe(30);
    expect(daysInMonth(new Date(2021, 0, 15))).toBe(31);
  });
  it("isWeekend", () => {
    expect(isWeekend(new Date(2021, 5, 12))).toBe(true);  // Saturday
    expect(isWeekend(new Date(2021, 5, 13))).toBe(true);  // Sunday
    expect(isWeekend(new Date(2021, 5, 14))).toBe(false); // Monday
  });
  it("getDayOfYear", () => {
    expect(getDayOfYear(new Date(2021, 0, 1))).toBe(1);
    expect(getDayOfYear(new Date(2020, 11, 31))).toBe(366); // leap year
    expect(getDayOfYear(new Date(2021, 11, 31))).toBe(365);
  });
  it("getWeekOfYear (ISO-8601)", () => {
    expect(getWeekOfYear(new Date(2021, 0, 4))).toBe(1);
    expect(getWeekOfYear(new Date(2021, 0, 1))).toBe(53); // belongs to 2020's last week
    expect(getWeekOfYear(new Date(2020, 11, 31))).toBe(53);
  });
  it("getQuarter", () => {
    expect(getQuarter(new Date(2021, 0, 1))).toBe(1);
    expect(getQuarter(new Date(2021, 3, 1))).toBe(2);
    expect(getQuarter(new Date(2021, 11, 1))).toBe(4);
  });
  it("isValid on garbage", () => {
    expect(isValid(new Date())).toBe(true);
    expect(isValid("2021-06-15")).toBe(true);
    expect(isValid("not a date")).toBe(false);
    expect(isValid("2021-13-40")).toBe(false);
    expect(isValid(new Date("bad"))).toBe(false);
    expect(isValid(NaN)).toBe(false);
  });
});

describe("format", () => {
  const d = new Date(2021, 0, 5, 9, 7, 3, 42); // Tue 05 Jan 2021 09:07:03.042

  it("formats the core token set", () => {
    expect(format(d, "YYYY-MM-DD HH:mm:ss.SSS")).toBe("2021-01-05 09:07:03.042");
    expect(format(d, "YY/M/D")).toBe("21/1/5");
  });
  it("formats 12-hour clock with meridiem", () => {
    expect(format(d, "hh:mm A")).toBe("09:07 AM");
    expect(format(new Date(2021, 0, 5, 13, 5), "h:mm a")).toBe("1:05 pm");
    expect(format(new Date(2021, 0, 5, 0, 0), "hh A")).toBe("12 AM");
    expect(format(new Date(2021, 0, 5, 12, 0), "hh A")).toBe("12 PM");
  });
  it("formats month & weekday names", () => {
    expect(format(d, "dddd, D MMMM YYYY")).toBe("Tuesday, 5 January 2021");
    expect(format(d, "ddd MMM")).toBe("Tue Jan");
  });
  it("honours bracket escaping", () => {
    expect(format(d, "[Year] YYYY [at] HH:mm")).toBe("Year 2021 at 09:07");
  });
  it("supports a custom locale", () => {
    const fr = { months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] };
    expect(format(d, "MMMM", { locale: fr })).toBe("janvier");
  });
  it("formats UTC with { utc: true }", () => {
    const inst = new Date(Date.UTC(2021, 0, 5, 9, 7, 3));
    expect(format(inst, "YYYY-MM-DD HH:mm:ss Z", { utc: true })).toBe("2021-01-05 09:07:03 Z");
  });
  it("returns 'Invalid Date' for bad input", () => {
    expect(format("garbage", "YYYY")).toBe("Invalid Date");
  });
});

describe("parse", () => {
  it("parses the core token set", () => {
    const d = parse("2021-06-15 13:45:30", "YYYY-MM-DD HH:mm:ss");
    expect(format(d, "YYYY-MM-DD HH:mm:ss")).toBe("2021-06-15 13:45:30");
  });
  it("parses 12-hour clock with PM", () => {
    const d = parse("06/15/2021 01:05 PM", "MM/DD/YYYY hh:mm A");
    expect(format(d, "HH:mm")).toBe("13:05");
  });
  it("parses a month name", () => {
    const d = parse("15 March 2021", "D MMMM YYYY");
    expect(format(d, "YYYY-MM-DD")).toBe("2021-03-15");
  });
  it("is strict: returns Invalid Date on mismatch", () => {
    expect(isValid(parse("nope", "YYYY-MM-DD"))).toBe(false);
    expect(isValid(parse("2021-06-15 extra", "YYYY-MM-DD"))).toBe(false);
  });
  it("rejects impossible calendar dates", () => {
    expect(isValid(parse("2021-02-30", "YYYY-MM-DD"))).toBe(false);
  });
  it("throws when throwOnInvalid is set", () => {
    expect(() => parse("nope", "YYYY-MM-DD", { throwOnInvalid: true })).toThrow();
  });
  it("round-trips with format for many patterns", () => {
    const patterns = ["YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss", "DD/MM/YYYY HH:mm", "D MMM YYYY"];
    const base = new Date(2021, 6, 9, 14, 8, 5, 0);
    for (const p of patterns) {
      const round = parse(format(base, p), p);
      expect(format(round, p)).toBe(format(base, p));
    }
  });
});

describe("ISO / unix", () => {
  it("parseISO date-only reads as local midnight", () => {
    expect(format(parseISO("2021-06-15"), "YYYY-MM-DD HH:mm")).toBe("2021-06-15 00:00");
  });
  it("parseISO with local time", () => {
    expect(format(parseISO("2021-06-15T13:45:30"), "YYYY-MM-DD HH:mm:ss")).toBe("2021-06-15 13:45:30");
  });
  it("parseISO with Z pins the UTC instant", () => {
    expect(parseISO("2021-06-15T13:45:30Z").getTime()).toBe(Date.UTC(2021, 5, 15, 13, 45, 30));
  });
  it("parseISO with an explicit offset", () => {
    expect(parseISO("2021-06-15T13:45:30+05:30").getTime()).toBe(Date.UTC(2021, 5, 15, 8, 15, 30));
  });
  it("parseISO rejects non-ISO input", () => {
    expect(isValid(parseISO("15/06/2021"))).toBe(false);
    expect(isValid(parseISO("2021-02-30"))).toBe(false);
  });
  it("toISO { utc } round-trips through parseISO", () => {
    const inst = new Date(Date.UTC(2021, 5, 15, 13, 45, 30, 123));
    const iso = toISO(inst, { utc: true });
    expect(iso).toBe("2021-06-15T13:45:30.123Z");
    expect(parseISO(iso).getTime()).toBe(inst.getTime());
  });
  it("toISO local carries an offset and round-trips the instant", () => {
    const d = new Date(2021, 5, 15, 13, 45, 30, 0);
    const iso = toISO(d);
    expect(iso).toMatch(/^2021-06-15T13:45:30\.000[+-]\d{2}:\d{2}$/);
    expect(parseISO(iso).getTime()).toBe(d.getTime());
  });
  it("unix / fromUnix", () => {
    const inst = new Date(Date.UTC(2021, 0, 1, 0, 0, 0));
    const secs = unix(inst);
    expect(secs).toBe(1609459200);
    expect(fromUnix(secs).getTime()).toBe(inst.getTime());
  });
});

describe("toDate coercion", () => {
  it("clones Date inputs (no aliasing)", () => {
    const src = new Date(2021, 0, 1);
    const out = toDate(src);
    out.setFullYear(1999);
    expect(src.getFullYear()).toBe(2021);
  });
  it("accepts epoch milliseconds", () => {
    expect(toDate(1609459200000).getTime()).toBe(1609459200000);
  });
});
