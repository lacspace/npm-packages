import { describe, it, expect } from "vitest";
import { parseCron, isValidCron, CronError } from "./parse.js";

describe("parseCron — valid", () => {
  it("parses a 5-field expression", () => {
    const f = parseCron("0 9 * * 1-5");
    expect(f.hasSeconds).toBe(false);
    expect(f.second).toEqual([0]);
    expect(f.minute).toEqual([0]);
    expect(f.hour).toEqual([9]);
    expect(f.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(f.domRestricted).toBe(false);
    expect(f.dowRestricted).toBe(true);
  });

  it("parses a 6-field expression with seconds", () => {
    const f = parseCron("30 0 9 * * *");
    expect(f.hasSeconds).toBe(true);
    expect(f.second).toEqual([30]);
    expect(f.minute).toEqual([0]);
    expect(f.hour).toEqual([9]);
  });

  it("expands steps, ranges and lists", () => {
    expect(parseCron("*/15 * * * *").minute).toEqual([0, 15, 30, 45]);
    expect(parseCron("0 9-17 * * *").hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parseCron("0 0 1,15 * *").dayOfMonth).toEqual([1, 15]);
    expect(parseCron("0 8-18/2 * * *").hour).toEqual([8, 10, 12, 14, 16, 18]);
  });

  it("resolves month and weekday names, and 7 = Sunday", () => {
    expect(parseCron("0 0 1 JAN *").month).toEqual([1]);
    expect(parseCron("0 9 * * MON-FRI").dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron("0 0 * * 7").dayOfWeek).toEqual([0]);
    expect(parseCron("0 0 * * SUN").dayOfWeek).toEqual([0]);
  });

  it("expands macros", () => {
    const daily = parseCron("@daily");
    expect(daily.minute).toEqual([0]);
    expect(daily.hour).toEqual([0]);
    expect(parseCron("@hourly").hour.length).toBe(24);
    expect(parseCron("@weekly").dayOfWeek).toEqual([0]);
  });

  it("treats ? as * for day fields", () => {
    const f = parseCron("0 0 ? * ?");
    expect(f.domRestricted).toBe(false);
    expect(f.dowRestricted).toBe(false);
    expect(f.dayOfMonth.length).toBe(31);
  });
});

describe("parseCron — invalid", () => {
  it("throws on out-of-range values", () => {
    expect(() => parseCron("99 0 * * *")).toThrow(CronError);
    expect(() => parseCron("0 0 * 13 *")).toThrow(/month/);
  });

  it("throws on garbage and wrong field counts", () => {
    expect(() => parseCron("not a cron")).toThrow(/5 or 6 fields/);
    expect(() => parseCron("* * *")).toThrow(CronError);
    expect(() => parseCron("")).toThrow(/Empty/);
  });

  it("throws on unknown names", () => {
    expect(() => parseCron("0 0 * * FOO")).toThrow(/unknown name/i);
  });

  it("parses advanced day tokens L/W/# (v0.2.0)", () => {
    expect(parseCron("0 0 L * *").dayOfMonthSpecial).toEqual([{ type: "last" }]);
    expect(parseCron("0 0 15W * *").dayOfMonthSpecial).toEqual([{ type: "nearestWeekday", day: 15 }]);
    expect(parseCron("0 0 * * 5#2").dayOfWeekSpecial).toEqual([{ type: "nth", weekday: 5, nth: 2 }]);
    expect(parseCron("0 0 * * 5L").dayOfWeekSpecial).toEqual([{ type: "last", weekday: 5 }]);
  });

  it("still rejects L/W/# in non-day fields", () => {
    expect(() => parseCron("L 0 * * *")).toThrow(/not valid here/i);
    expect(() => parseCron("0 0 * 5W *")).toThrow(/not valid here/i);
  });

  it("rejects @reboot with a clear message", () => {
    expect(() => parseCron("@reboot")).toThrow(/reboot/i);
  });
});

describe("isValidCron", () => {
  it("returns true/false without throwing", () => {
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("@daily")).toBe(true);
    expect(isValidCron("99 * * * *")).toBe(false);
    expect(isValidCron("nonsense")).toBe(false);
  });
});
