import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  clampDate,
  compareDay,
  daySlots,
  daysInMonth,
  defaultPresets,
  diffInDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  floorToStep,
  formatDate,
  formatTimeValue,
  from12Hour,
  hasSlot,
  isCompleteRange,
  isDateDisabled,
  isInPreviewRange,
  isInRange,
  isLeapYear,
  isMonthDisabled,
  isRangeAllowed,
  isSameDay,
  isYearDisabled,
  isoWeekNumber,
  makeDate,
  monthGrid,
  monthNames,
  nextEnabledDate,
  nextFocusFromKey,
  nightsBetween,
  normalizeRange,
  normalizeTime,
  parseDate,
  parseTimeText,
  previewRange,
  relativeFallback,
  relativeParts,
  relativeRefreshMs,
  resolveLocale,
  roundToStep,
  selectRangeDate,
  setTimeValue,
  startOfDay,
  startOfMonth,
  startOfWeek,
  stepTimePart,
  to12Hour,
  toggleSlot,
  utcStamp,
  weekdayNames,
  weekdayOrder,
} from "./engine.js";

/** Every date in these tests is fixed — a calendar test that reads the clock
 *  is a test that fails on the last day of the month. */
const FEB_3_2025 = makeDate(2025, 1, 3); // a Monday
const JAN_31_2025 = makeDate(2025, 0, 31);

describe("month grid generation", () => {
  it("emits whole weeks of seven days for every row", () => {
    for (const month of [0, 1, 5, 11]) {
      for (const week of monthGrid(2025, month)) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it("pads February 2025 with the last days of January and the first of March", () => {
    const weeks = monthGrid(2025, 1);
    const firstRow = weeks[0] ?? [];
    const lastRow = weeks[weeks.length - 1] ?? [];
    expect(firstRow[0]?.key).toBe("2025-01-26");
    expect(firstRow[0]?.outside).toBe(true);
    expect(lastRow[lastRow.length - 1]?.key).toBe("2025-03-01");
    expect(weeks).toHaveLength(5);
  });

  it("starts the week on Monday when asked, shifting the leading padding", () => {
    const weeks = monthGrid(2025, 1, { weekStartsOn: 1 });
    expect(weeks[0]?.[0]?.key).toBe("2025-01-27");
    expect(weeks[0]?.[0]?.date.getDay()).toBe(1);
  });

  it("shows all 29 days of February in a leap year", () => {
    const days = monthGrid(2024, 1)
      .flat()
      .filter((day) => !day.outside);
    expect(days).toHaveLength(29);
    expect(days[days.length - 1]?.key).toBe("2024-02-29");
  });

  it("adds no leading padding to a month that starts on the first weekday", () => {
    // 1 June 2025 was a Sunday.
    const weeks = monthGrid(2025, 5, { weekStartsOn: 0 });
    expect(weeks[0]?.[0]?.key).toBe("2025-06-01");
    expect(weeks[0]?.[0]?.outside).toBe(false);
  });

  it("pads to six rows when fixedWeeks is set, so the height never jumps", () => {
    expect(monthGrid(2025, 1, { fixedWeeks: true })).toHaveLength(6);
    expect(monthGrid(2025, 1)).toHaveLength(5);
  });

  it("orders the weekday columns from the configured first day", () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("day and month arithmetic", () => {
  it("adds days without mutating the date it was given", () => {
    const original = makeDate(2025, 1, 3);
    const moved = addDays(original, 5);
    expect(formatDate(moved)).toBe("2025-02-08");
    expect(formatDate(original)).toBe("2025-02-03");
  });

  it("rolls into the next month when the days run out", () => {
    expect(formatDate(addDays(JAN_31_2025, 1))).toBe("2025-02-01");
    expect(formatDate(addDays(makeDate(2025, 11, 31), 1))).toBe("2026-01-01");
  });

  it("subtracts days across a year boundary", () => {
    expect(formatDate(addDays(makeDate(2025, 0, 1), -1))).toBe("2024-12-31");
  });

  it("clamps 31 January plus one month to the end of February", () => {
    expect(formatDate(addMonths(JAN_31_2025, 1))).toBe("2025-02-28");
    expect(formatDate(addMonths(makeDate(2024, 0, 31), 1))).toBe("2024-02-29");
  });

  it("clamps backwards too — 31 March minus a month is 28 February", () => {
    expect(formatDate(addMonths(makeDate(2025, 2, 31), -1))).toBe("2025-02-28");
  });

  it("wraps the year when months cross December", () => {
    expect(formatDate(addMonths(makeDate(2025, 10, 15), 3))).toBe("2026-02-15");
    expect(formatDate(addMonths(makeDate(2025, 1, 15), -3))).toBe("2024-11-15");
  });

  it("keeps 29 February from becoming 1 March a year later", () => {
    expect(formatDate(addYears(makeDate(2024, 1, 29), 1))).toBe("2025-02-28");
  });

  it("knows how long each month is, leap years included", () => {
    expect(daysInMonth(2025, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 3)).toBe(30);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe("boundaries", () => {
  it("strips the time when starting a day and fills it when ending one", () => {
    const noisy = makeDate(2025, 1, 3, 14, 37, 22, 500);
    const start = startOfDay(noisy);
    const end = endOfDay(noisy);
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
    expect(isSameDay(start, end)).toBe(true);
  });

  it("finds the start of the week for both week conventions", () => {
    const sunday = makeDate(2025, 1, 2);
    expect(formatDate(startOfWeek(sunday, 0))).toBe("2025-02-02");
    expect(formatDate(startOfWeek(sunday, 1))).toBe("2025-01-27");
    expect(formatDate(endOfWeek(sunday, 1))).toBe("2025-02-02");
  });

  it("finds the first and last day of a month", () => {
    expect(formatDate(startOfMonth(FEB_3_2025))).toBe("2025-02-01");
    expect(formatDate(endOfMonth(FEB_3_2025))).toBe("2025-02-28");
    expect(formatDate(endOfMonth(makeDate(2024, 1, 10)))).toBe("2024-02-29");
  });

  it("numbers ISO weeks from the week holding the first Thursday", () => {
    expect(isoWeekNumber(makeDate(2025, 0, 1))).toBe(1);
    expect(isoWeekNumber(makeDate(2025, 0, 6))).toBe(2);
    expect(isoWeekNumber(makeDate(2025, 11, 31))).toBe(1);
  });
});

describe("comparison", () => {
  it("calls two instants on the same day equal whatever the clock says", () => {
    expect(isSameDay(makeDate(2025, 1, 3, 0, 1), makeDate(2025, 1, 3, 23, 59))).toBe(true);
    expect(isSameDay(makeDate(2025, 1, 3, 23, 59), makeDate(2025, 1, 4, 0, 1))).toBe(false);
  });

  it("compares by calendar day, ignoring the time of day", () => {
    expect(compareDay(makeDate(2025, 1, 3, 23, 0), makeDate(2025, 1, 3, 1, 0))).toBe(0);
    expect(compareDay(makeDate(2025, 1, 3), makeDate(2025, 1, 4))).toBe(-1);
    expect(compareDay(makeDate(2025, 1, 5), makeDate(2025, 1, 4))).toBe(1);
  });

  it("counts whole calendar days between two dates", () => {
    expect(diffInDays(makeDate(2025, 2, 1), makeDate(2025, 1, 1))).toBe(28);
    expect(diffInDays(makeDate(2025, 1, 1), makeDate(2025, 2, 1))).toBe(-28);
    expect(diffInDays(makeDate(2025, 1, 3, 23, 0), makeDate(2025, 1, 3, 1, 0))).toBe(0);
  });

  it("pulls a date back inside its bounds", () => {
    const min = makeDate(2025, 1, 10);
    const max = makeDate(2025, 1, 20);
    expect(formatDate(clampDate(makeDate(2025, 1, 1), min, max))).toBe("2025-02-10");
    expect(formatDate(clampDate(makeDate(2025, 1, 28), min, max))).toBe("2025-02-20");
    expect(formatDate(clampDate(makeDate(2025, 1, 15), min, max))).toBe("2025-02-15");
  });

  it("lists every day of an interval, and nothing for a backwards one", () => {
    expect(eachDayOfInterval(makeDate(2025, 1, 3), makeDate(2025, 1, 6))).toHaveLength(4);
    expect(eachDayOfInterval(makeDate(2025, 1, 6), makeDate(2025, 1, 3))).toHaveLength(0);
  });
});

describe("daylight saving", () => {
  // Capture the *resolved* zone: process.env.TZ is usually unset, and writing
  // `undefined` back into it would leave the process in a broken zone for
  // every test that follows.
  const original = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("really is running in a zone that observes DST", () => {
    // Guards the three tests below: if the zone did not take effect they would
    // pass without proving anything.
    expect(makeDate(2025, 2, 8, 12).getTimezoneOffset()).not.toBe(
      makeDate(2025, 2, 10, 12).getTimezoneOffset(),
    );
  });

  it("lands on the next calendar day across the spring-forward gap", () => {
    // 9 March 2025 is 23 hours long in New York.
    const before = makeDate(2025, 2, 8, 12, 0);
    expect(formatDate(addDays(before, 1))).toBe("2025-03-09");
    expect(formatDate(addDays(before, 2))).toBe("2025-03-10");
  });

  it("lands on the next calendar day across the autumn fall-back", () => {
    // 2 November 2025 is 25 hours long in New York.
    const before = makeDate(2025, 10, 1, 12, 0);
    expect(formatDate(addDays(before, 1))).toBe("2025-11-02");
    expect(formatDate(addDays(before, 2))).toBe("2025-11-03");
  });

  it("still counts one day between the two sides of a transition", () => {
    expect(diffInDays(makeDate(2025, 2, 10), makeDate(2025, 2, 9))).toBe(1);
    expect(diffInDays(makeDate(2025, 10, 3), makeDate(2025, 10, 2))).toBe(1);
  });

  it("keeps a month grid at seven days a row through a transition month", () => {
    for (const week of monthGrid(2025, 2)) expect(week).toHaveLength(7);
  });
});

describe("ranges", () => {
  const start = makeDate(2025, 1, 10);
  const end = makeDate(2025, 1, 14);

  it("swaps the ends when the end lands before the start", () => {
    const fixed = normalizeRange({ start: end, end: start });
    expect(formatDate(fixed.start as Date)).toBe("2025-02-10");
    expect(formatDate(fixed.end as Date)).toBe("2025-02-14");
  });

  it("leaves a half-open range alone and reports it incomplete", () => {
    const half = normalizeRange({ start, end: null });
    expect(half.end).toBeNull();
    expect(isCompleteRange(half)).toBe(false);
    expect(isCompleteRange({ start, end })).toBe(true);
  });

  it("includes both ends of the range and excludes the days around it", () => {
    const range = { start, end };
    expect(isInRange(start, range)).toBe(true);
    expect(isInRange(end, range)).toBe(true);
    expect(isInRange(makeDate(2025, 1, 12), range)).toBe(true);
    expect(isInRange(makeDate(2025, 1, 9), range)).toBe(false);
    expect(isInRange(makeDate(2025, 1, 15), range)).toBe(false);
  });

  it("previews a hover in either direction", () => {
    expect(isInPreviewRange(makeDate(2025, 1, 12), start, end)).toBe(true);
    expect(isInPreviewRange(makeDate(2025, 1, 12), end, start)).toBe(true);
    expect(isInPreviewRange(makeDate(2025, 1, 20), start, end)).toBe(false);
    expect(isInPreviewRange(makeDate(2025, 1, 12), null, end)).toBe(false);
  });

  it("normalises the previewed range so the start is always first", () => {
    const preview = previewRange(end, start);
    expect(formatDate(preview.start as Date)).toBe("2025-02-10");
  });

  it("counts nights, not days", () => {
    expect(nightsBetween(start, end)).toBe(4);
    expect(nightsBetween(end, start)).toBe(4);
    expect(nightsBetween(start, start)).toBe(0);
  });

  it("sets the start on the first click and the end on the second", () => {
    const first = selectRangeDate({ start: null, end: null }, start);
    expect(formatDate(first.start as Date)).toBe("2025-02-10");
    expect(first.end).toBeNull();

    const second = selectRangeDate(first, end);
    expect(formatDate(second.end as Date)).toBe("2025-02-14");
  });

  it("re-anchors instead of building a backwards range", () => {
    const pending = { start, end: null };
    const next = selectRangeDate(pending, makeDate(2025, 1, 5));
    expect(formatDate(next.start as Date)).toBe("2025-02-05");
    expect(next.end).toBeNull();
  });

  it("starts a new range when one is already complete", () => {
    const next = selectRangeDate({ start, end }, makeDate(2025, 1, 20));
    expect(formatDate(next.start as Date)).toBe("2025-02-20");
    expect(next.end).toBeNull();
  });

  it("refuses to complete a range that breaks the night limits", () => {
    const pending = { start, end: null };
    const tooShort = selectRangeDate(pending, makeDate(2025, 1, 11), { minNights: 3 });
    expect(tooShort.end).toBeNull();
    expect(formatDate(tooShort.start as Date)).toBe("2025-02-11");

    const tooLong = selectRangeDate(pending, makeDate(2025, 1, 28), { maxNights: 7 });
    expect(tooLong.end).toBeNull();

    const allowed = selectRangeDate(pending, makeDate(2025, 1, 14), { minNights: 3, maxNights: 7 });
    expect(formatDate(allowed.end as Date)).toBe("2025-02-14");
  });

  it("judges a finished range against the limits", () => {
    expect(isRangeAllowed({ start, end }, { minNights: 4 })).toBe(true);
    expect(isRangeAllowed({ start, end }, { minNights: 5 })).toBe(false);
    expect(isRangeAllowed({ start, end }, { maxNights: 3 })).toBe(false);
    expect(isRangeAllowed({ start, end: null }, { minNights: 99 })).toBe(true);
  });

  it("builds the shortcut ranges from a given 'now'", () => {
    const now = makeDate(2025, 1, 14, 11, 0);
    const presets = defaultPresets();
    const byId = (id: string): ReturnType<typeof normalizeRange> => {
      const preset = presets.find((p) => p.id === id);
      if (!preset) throw new Error(`missing preset ${id}`);
      return preset.range(now);
    };
    expect(formatDate(byId("today").start as Date)).toBe("2025-02-14");
    expect(formatDate(byId("last7").start as Date)).toBe("2025-02-08");
    expect(formatDate(byId("this-month").start as Date)).toBe("2025-02-01");
    expect(formatDate(byId("this-month").end as Date)).toBe("2025-02-28");
    expect(formatDate(byId("last-month").start as Date)).toBe("2025-01-01");
    expect(formatDate(byId("last-month").end as Date)).toBe("2025-01-31");
    expect(formatDate(byId("ytd").start as Date)).toBe("2025-01-01");
  });
});

describe("disabled days", () => {
  const rules = {
    min: makeDate(2025, 1, 5),
    max: makeDate(2025, 1, 25),
    dates: [makeDate(2025, 1, 14)],
    weekdays: [0, 6],
    matcher: (date: Date) => date.getDate() === 19,
  };

  it("blocks anything outside the min and max", () => {
    expect(isDateDisabled(makeDate(2025, 1, 4), rules)).toBe(true);
    expect(isDateDisabled(makeDate(2025, 1, 26), rules)).toBe(true);
    expect(isDateDisabled(makeDate(2025, 1, 10), rules)).toBe(false);
  });

  it("treats the bounds themselves as selectable, whatever their time of day", () => {
    expect(isDateDisabled(makeDate(2025, 1, 5, 23, 30), rules)).toBe(false);
    expect(isDateDisabled(makeDate(2025, 1, 25, 0, 1), rules)).toBe(false);
  });

  it("blocks listed dates, listed weekdays and whatever the matcher says", () => {
    expect(isDateDisabled(makeDate(2025, 1, 14), rules)).toBe(true); // listed
    expect(isDateDisabled(makeDate(2025, 1, 8), rules)).toBe(true); // Saturday
    expect(isDateDisabled(makeDate(2025, 1, 9), rules)).toBe(true); // Sunday
    expect(isDateDisabled(makeDate(2025, 1, 19), rules)).toBe(true); // matcher
  });

  it("allows everything when there are no rules at all", () => {
    expect(isDateDisabled(FEB_3_2025)).toBe(false);
    expect(isDateDisabled(FEB_3_2025, {})).toBe(false);
  });

  it("walks to the next selectable day, and gives up when everything is blocked", () => {
    const found = nextEnabledDate(makeDate(2025, 1, 8), rules);
    expect(found && formatDate(found)).toBe("2025-02-10");
    expect(nextEnabledDate(FEB_3_2025, { matcher: () => true }, 1, 10)).toBeNull();
  });

  it("blocks whole months and years that fall outside the bounds", () => {
    const bounds = { min: makeDate(2025, 1, 5), max: makeDate(2025, 5, 30) };
    expect(isMonthDisabled(2025, 0, bounds)).toBe(true);
    expect(isMonthDisabled(2025, 1, bounds)).toBe(false);
    expect(isMonthDisabled(2025, 6, bounds)).toBe(true);
    expect(isYearDisabled(2024, bounds)).toBe(true);
    expect(isYearDisabled(2025, bounds)).toBe(false);
  });
});

describe("formatting", () => {
  it("renders the numeric tokens with the right padding", () => {
    const date = makeDate(2025, 1, 3, 9, 5, 7);
    expect(formatDate(date, "yyyy-MM-dd")).toBe("2025-02-03");
    expect(formatDate(date, "d/M/yyyy")).toBe("3/2/2025");
    expect(formatDate(date, "dd.MM.yy")).toBe("03.02.25");
    expect(formatDate(date, "HH:mm:ss")).toBe("09:05:07");
  });

  it("renders 12-hour time with a meridiem, midnight included", () => {
    expect(formatDate(makeDate(2025, 1, 3, 0, 5), "h:mm a")).toBe("12:05 AM");
    expect(formatDate(makeDate(2025, 1, 3, 12, 5), "h:mm a")).toBe("12:05 PM");
    expect(formatDate(makeDate(2025, 1, 3, 15, 5), "hh:mm a")).toBe("03:05 PM");
  });

  it("passes quoted text through untouched", () => {
    expect(formatDate(makeDate(2025, 1, 3, 14, 30), "yyyy-MM-dd'T'HH:mm")).toBe("2025-02-03T14:30");
  });

  it("returns an empty string for an invalid date rather than 'NaN'", () => {
    expect(formatDate(new Date("nope"))).toBe("");
  });

  it("gives a deterministic UTC stamp for server rendering", () => {
    expect(utcStamp(new Date(Date.UTC(2025, 1, 3, 14, 5)))).toBe("2025-02-03 14:05 UTC");
  });
});

describe("parsing typed input", () => {
  it("reads a date written in the same pattern it is rendered in", () => {
    const parsed = parseDate("03/02/2025", "dd/MM/yyyy");
    expect(parsed && formatDate(parsed)).toBe("2025-02-03");
  });

  it("accepts single-digit days and months against a loose pattern", () => {
    const parsed = parseDate("3/2/2025", "d/M/yyyy");
    expect(parsed && formatDate(parsed)).toBe("2025-02-03");
  });

  it("rejects 31 February instead of rolling it into March", () => {
    expect(parseDate("31/02/2025", "dd/MM/yyyy")).toBeNull();
    expect(parseDate("29/02/2025", "dd/MM/yyyy")).toBeNull();
    expect(parseDate("29/02/2024", "dd/MM/yyyy")).not.toBeNull();
  });

  it("rejects garbage, empty text and out-of-range parts", () => {
    expect(parseDate("hello", "dd/MM/yyyy")).toBeNull();
    expect(parseDate("   ", "dd/MM/yyyy")).toBeNull();
    expect(parseDate("2025-13-01", "yyyy-MM-dd")).toBeNull();
    expect(parseDate("2025-00-10", "yyyy-MM-dd")).toBeNull();
    expect(parseDate("03/02/2025 extra", "dd/MM/yyyy")).toBeNull();
  });

  it("reads the time part when the pattern has one", () => {
    const parsed = parseDate("2025-02-03 14:30", "yyyy-MM-dd HH:mm");
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(30);
    expect(parseDate("2025-02-03 24:00", "yyyy-MM-dd HH:mm")).toBeNull();
  });

  it("reads a 12-hour time with its meridiem", () => {
    const parsed = parseDate("2025-02-03 2:30 PM", "yyyy-MM-dd h:mm a");
    expect(parsed?.getHours()).toBe(14);
    expect(parseDate("2025-02-03 12:30 AM", "yyyy-MM-dd h:mm a")?.getHours()).toBe(0);
    expect(parseDate("2025-02-03 13:30 PM", "yyyy-MM-dd h:mm a")).toBeNull();
  });

  it("round-trips anything it formatted", () => {
    const date = makeDate(2025, 6, 9, 8, 4);
    for (const pattern of ["yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd HH:mm"]) {
      const text = formatDate(date, pattern);
      const back = parseDate(text, pattern);
      expect(back && formatDate(back, pattern)).toBe(text);
    }
  });
});

describe("time of day", () => {
  it("rounds to the nearest step and floors when asked", () => {
    expect(roundToStep(7, 15)).toBe(0);
    expect(roundToStep(8, 15)).toBe(15);
    expect(roundToStep(23, 15)).toBe(30);
    expect(floorToStep(58, 15)).toBe(45);
    expect(roundToStep(7, 1)).toBe(7);
  });

  it("snaps a time onto its steps without overflowing the hour", () => {
    expect(normalizeTime({ hours: 10, minutes: 7, seconds: 0 }, { minuteStep: 15 })).toEqual({
      hours: 10,
      minutes: 0,
      seconds: 0,
    });
    expect(normalizeTime({ hours: 10, minutes: 58, seconds: 0 }, { minuteStep: 15 }).minutes).toBe(59);
  });

  it("converts between 12- and 24-hour clocks at the awkward ends", () => {
    expect(to12Hour(0)).toEqual({ hour: 12, period: "AM" });
    expect(to12Hour(12)).toEqual({ hour: 12, period: "PM" });
    expect(to12Hour(13)).toEqual({ hour: 1, period: "PM" });
    expect(from12Hour(12, "AM")).toBe(0);
    expect(from12Hour(12, "PM")).toBe(12);
    expect(from12Hour(1, "PM")).toBe(13);
  });

  it("wraps a stepped segment round its own range", () => {
    expect(stepTimePart(23, 1, 23)).toBe(0);
    expect(stepTimePart(0, -1, 23)).toBe(23);
    expect(stepTimePart(0, -1, 59, 15)).toBe(45);
    expect(stepTimePart(45, 1, 59, 15)).toBe(0);
  });

  it("formats a time in both clocks", () => {
    const time = { hours: 14, minutes: 5, seconds: 9 };
    expect(formatTimeValue(time)).toBe("14:05");
    expect(formatTimeValue(time, { showSeconds: true })).toBe("14:05:09");
    expect(formatTimeValue(time, { use12Hour: true })).toBe("2:05 PM");
  });

  it("reads a typed time and rejects an impossible one", () => {
    expect(parseTimeText("9")).toEqual({ hours: 9, minutes: 0, seconds: 0 });
    expect(parseTimeText("09:05:30")).toEqual({ hours: 9, minutes: 5, seconds: 30 });
    expect(parseTimeText("9:05 pm")).toEqual({ hours: 21, minutes: 5, seconds: 0 });
    expect(parseTimeText("25:00")).toBeNull();
    expect(parseTimeText("9:75")).toBeNull();
    expect(parseTimeText("half nine")).toBeNull();
  });

  it("replaces the time on a date without moving the day", () => {
    const stamped = setTimeValue(FEB_3_2025, { hours: 23, minutes: 45, seconds: 0 });
    expect(formatDate(stamped, "yyyy-MM-dd HH:mm")).toBe("2025-02-03 23:45");
  });
});

describe("schedule slots", () => {
  it("cuts a working day into slots of the configured length", () => {
    const slots = daySlots(FEB_3_2025, { startHour: 9, endHour: 17, slotMinutes: 30 });
    expect(slots).toHaveLength(16);
    expect(formatDate(slots[0] as Date, "HH:mm")).toBe("09:00");
    expect(formatDate(slots[slots.length - 1] as Date, "HH:mm")).toBe("16:30");
  });

  it("returns nothing for a day that ends before it starts", () => {
    expect(daySlots(FEB_3_2025, { startHour: 17, endHour: 9 })).toHaveLength(0);
  });

  it("toggles a slot in and out of the selection by value, not identity", () => {
    const slots = daySlots(FEB_3_2025, { startHour: 9, endHour: 11, slotMinutes: 60 });
    const first = slots[0] as Date;
    const picked = toggleSlot([], first);
    expect(picked).toHaveLength(1);
    expect(hasSlot(picked, new Date(first.getTime()))).toBe(true);
    expect(toggleSlot(picked, new Date(first.getTime()))).toHaveLength(0);
  });
});

describe("relative time", () => {
  const now = makeDate(2025, 1, 3, 12, 0, 0);

  it("buckets seconds, minutes, hours, days and weeks in the past", () => {
    expect(relativeParts(makeDate(2025, 1, 3, 11, 59, 30), now)).toEqual({ value: 30, unit: "second", past: true });
    expect(relativeParts(makeDate(2025, 1, 3, 11, 57), now)).toEqual({ value: 3, unit: "minute", past: true });
    expect(relativeParts(makeDate(2025, 1, 3, 9, 0), now)).toEqual({ value: 3, unit: "hour", past: true });
    expect(relativeParts(makeDate(2025, 0, 31, 12, 0), now)).toEqual({ value: 3, unit: "day", past: true });
    expect(relativeParts(makeDate(2025, 0, 13, 12, 0), now)).toEqual({ value: 3, unit: "week", past: true });
  });

  it("buckets the same distances in the future", () => {
    expect(relativeParts(makeDate(2025, 1, 3, 12, 3), now)).toEqual({ value: 3, unit: "minute", past: false });
    expect(relativeParts(makeDate(2025, 1, 6, 12, 0), now)).toEqual({ value: 3, unit: "day", past: false });
  });

  it("rounds down, so 90 seconds is one minute rather than two", () => {
    expect(relativeParts(makeDate(2025, 1, 3, 11, 58, 30), now).value).toBe(1);
    expect(relativeParts(makeDate(2025, 1, 3, 11, 58, 30), now).unit).toBe("minute");
  });

  it("reaches months and years for older timestamps", () => {
    expect(relativeParts(makeDate(2024, 10, 3, 12, 0), now).unit).toBe("month");
    expect(relativeParts(makeDate(2022, 1, 3, 12, 0), now)).toEqual({ value: 3, unit: "year", past: true });
  });

  it("writes the singular without an 's' and marks the direction", () => {
    expect(relativeFallback({ value: 1, unit: "minute", past: true })).toBe("1 minute ago");
    expect(relativeFallback({ value: 3, unit: "minute", past: true })).toBe("3 minutes ago");
    expect(relativeFallback({ value: 1, unit: "day", past: false })).toBe("in 1 day");
    expect(relativeFallback({ value: 2, unit: "week", past: false })).toBe("in 2 weeks");
    expect(relativeFallback({ value: 0, unit: "second", past: true })).toBe("just now");
  });

  it("ticks fast for fresh timestamps and slowly for old ones", () => {
    expect(relativeRefreshMs({ value: 5, unit: "second", past: true })).toBe(1000);
    expect(relativeRefreshMs({ value: 5, unit: "minute", past: true })).toBe(30_000);
    expect(relativeRefreshMs({ value: 5, unit: "year", past: true })).toBe(3_600_000);
  });
});

describe("keyboard movement", () => {
  it("moves a day with the left and right arrows", () => {
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "ArrowRight") as Date)).toBe("2025-02-04");
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "ArrowLeft") as Date)).toBe("2025-02-02");
  });

  it("moves a week with the up and down arrows", () => {
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "ArrowDown") as Date)).toBe("2025-02-10");
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "ArrowUp") as Date)).toBe("2025-01-27");
  });

  it("moves a month with PageUp and PageDown, and a year with Shift", () => {
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "PageDown") as Date)).toBe("2025-03-03");
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "PageUp") as Date)).toBe("2025-01-03");
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "PageUp", 0, true) as Date)).toBe("2024-02-03");
  });

  it("jumps to the ends of the week with Home and End", () => {
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "Home", 0) as Date)).toBe("2025-02-02");
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "End", 0) as Date)).toBe("2025-02-08");
    expect(formatDate(nextFocusFromKey(FEB_3_2025, "Home", 1) as Date)).toBe("2025-02-03");
  });

  it("ignores keys a calendar has no opinion about", () => {
    expect(nextFocusFromKey(FEB_3_2025, "Tab")).toBeNull();
    expect(nextFocusFromKey(FEB_3_2025, "a")).toBeNull();
  });
});

describe("locale names", () => {
  it("gives twelve months and seven weekdays whatever the runtime knows", () => {
    expect(monthNames()).toHaveLength(12);
    expect(weekdayNames()).toHaveLength(7);
    expect(weekdayNames(undefined, "short", 1)).toHaveLength(7);
  });

  it("degrades to the runtime default instead of throwing on a bad tag", () => {
    expect(resolveLocale(undefined)).toBeUndefined();
    expect(resolveLocale("!!not a locale!!")).toBeUndefined();
    expect(() => monthNames("!!not a locale!!")).not.toThrow();
  });
});
