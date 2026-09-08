import { describe, it, expect } from "vitest";
import {
  isToday, isYesterday, isTomorrow, isPast, isFuture,
  isFirstDayOfMonth, isLastDayOfMonth,
  nextWeekday, previousWeekday,
  getMonthName, getWeekdayName, getDaysInYear,
  calendarGrid, format,
} from "./index.js";

describe("relative-to-now predicates", () => {
  const now = new Date(2021, 5, 15, 12, 0, 0);

  it("isToday / isYesterday / isTomorrow", () => {
    expect(isToday(new Date(2021, 5, 15, 23, 0), { now })).toBe(true);
    expect(isYesterday(new Date(2021, 5, 14, 1, 0), { now })).toBe(true);
    expect(isTomorrow(new Date(2021, 5, 16, 5, 0), { now })).toBe(true);
    expect(isToday(new Date(2021, 5, 16), { now })).toBe(false);
  });

  it("isPast / isFuture", () => {
    expect(isPast(new Date(2021, 5, 15, 11, 0), { now })).toBe(true);
    expect(isFuture(new Date(2021, 5, 15, 13, 0), { now })).toBe(true);
    expect(isPast(new Date(2021, 5, 15, 13, 0), { now })).toBe(false);
  });

  it("isFirstDayOfMonth / isLastDayOfMonth", () => {
    expect(isFirstDayOfMonth(new Date(2021, 5, 1))).toBe(true);
    expect(isFirstDayOfMonth(new Date(2021, 5, 2))).toBe(false);
    expect(isLastDayOfMonth(new Date(2021, 5, 30))).toBe(true);   // June has 30 days
    expect(isLastDayOfMonth(new Date(2020, 1, 29))).toBe(true);   // leap February
    expect(isLastDayOfMonth(new Date(2021, 1, 28))).toBe(true);   // common February
    expect(isLastDayOfMonth(new Date(2021, 5, 29))).toBe(false);
  });
});

describe("weekday navigation & name getters", () => {
  it("nextWeekday / previousWeekday", () => {
    // Tue 2021-06-15 → next Monday is 06-21, previous Monday is 06-14
    expect(format(nextWeekday(new Date(2021, 5, 15), 1), "YYYY-MM-DD")).toBe("2021-06-21");
    expect(format(previousWeekday(new Date(2021, 5, 15), 1), "YYYY-MM-DD")).toBe("2021-06-14");
    // asking for the same weekday jumps a full week
    expect(format(nextWeekday(new Date(2021, 5, 15), 2), "YYYY-MM-DD")).toBe("2021-06-22");
  });

  it("getMonthName / getWeekdayName", () => {
    const d = new Date(2021, 0, 5); // Tuesday, January
    expect(getMonthName(d)).toBe("January");
    expect(getMonthName(d, { short: true })).toBe("Jan");
    expect(getWeekdayName(d)).toBe("Tuesday");
    expect(getWeekdayName(d, { short: true })).toBe("Tue");
  });

  it("getDaysInYear", () => {
    expect(getDaysInYear(2020)).toBe(366);
    expect(getDaysInYear(2021)).toBe(365);
    expect(getDaysInYear(new Date(2024, 0, 1))).toBe(366);
  });
});

describe("calendarGrid", () => {
  const now = new Date(2021, 5, 15, 12, 0);

  it("builds a Monday-start June 2021 grid", () => {
    const grid = calendarGrid(new Date(2021, 5, 10), { now });
    expect(grid).toHaveLength(5);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    // first cell is the Monday before June 1 (May 31), out of month
    const first = grid[0]![0]!;
    expect(format(first.date, "YYYY-MM-DD")).toBe("2021-05-31");
    expect(first.inMonth).toBe(false);
    // June 15 exists, in month, flagged today
    const cells = grid.flat();
    const jun15 = cells.find((c) => c.inMonth && c.day === 15)!;
    expect(jun15.isToday).toBe(true);
    expect(jun15.month).toBe(5);
  });

  it("honours weekStartsOn: 0 (Sunday)", () => {
    const grid = calendarGrid(new Date(2021, 5, 10), { now, weekStartsOn: 0 });
    expect(format(grid[0]![0]!.date, "YYYY-MM-DD")).toBe("2021-05-30"); // Sunday
  });

  it("fixedWeeks always yields six rows", () => {
    const grid = calendarGrid(new Date(2021, 5, 10), { now, fixedWeeks: true });
    expect(grid).toHaveLength(6);
    expect(grid.flat()).toHaveLength(42);
  });
});
