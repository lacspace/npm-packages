import { test, expect } from "vitest";
import {
  NSE,
  NYSE,
  createClock,
  currentSegment,
  nextSegmentChange,
  timeUntilOpen,
  timeUntilClose,
  nextSessions,
  sessionsBetween,
  isTradingDay,
  isHoliday,
  isHalfDay,
} from "./index";

const nse = createClock(NSE);
const nyse = createClock(NYSE);

// ---- segment detection across pre / regular / post / closed (NYSE, ET) ----
// 2025-06-16 is a Monday. New York = EDT (UTC-4) in June.

test("NYSE segment: pre-market", () => {
  // 08:00 ET = 12:00 UTC → premarket window 04:00–09:30.
  expect(nyse.currentSegment(new Date(Date.UTC(2025, 5, 16, 12, 0)))).toBe("pre-open");
});

test("NYSE segment: regular", () => {
  // 10:00 ET = 14:00 UTC.
  expect(currentSegment(NYSE, new Date(Date.UTC(2025, 5, 16, 14, 0)))).toBe("regular");
});

test("NYSE segment: post / after-hours", () => {
  // 17:00 ET = 21:00 UTC → after-hours 16:00–20:00.
  expect(nyse.currentSegment(new Date(Date.UTC(2025, 5, 16, 21, 0)))).toBe("post");
});

test("NYSE segment: closed (overnight)", () => {
  // 21:00 ET = 01:00 UTC next day → after post close.
  expect(nyse.currentSegment(new Date(Date.UTC(2025, 5, 17, 1, 0)))).toBe("closed");
  // Sunday is closed.
  expect(nyse.currentSegment(new Date(Date.UTC(2025, 5, 15, 14, 0)))).toBe("closed");
});

test("nextSegmentChange: pre-open → regular at 09:30 ET", () => {
  const change = nyse.nextSegmentChange(new Date(Date.UTC(2025, 5, 16, 12, 0)));
  expect(change.segment).toBe("regular");
  // 09:30 ET = 13:30 UTC.
  expect(change.at.getTime()).toBe(Date.UTC(2025, 5, 16, 13, 30));
});

test("nextSegmentChange: regular → post at 16:00 ET", () => {
  const change = nyse.nextSegmentChange(new Date(Date.UTC(2025, 5, 16, 14, 0)));
  expect(change.segment).toBe("post");
  expect(change.at.getTime()).toBe(Date.UTC(2025, 5, 16, 20, 0));
});

// ---- half-day / early close (NYSE 2025-11-28 closes 13:00 ET, EST UTC-5) ----

test("half-day is detected and closes early", () => {
  expect(nyse.isHalfDay(new Date(Date.UTC(2025, 10, 28, 17, 0)))).toBe(true);
  // 12:00 ET = 17:00 UTC → still regular.
  expect(nyse.currentSegment(new Date(Date.UTC(2025, 10, 28, 17, 0)))).toBe("regular");
  // 13:30 ET = 18:30 UTC → past the 13:00 early close, before after-hours → closed.
  expect(nyse.currentSegment(new Date(Date.UTC(2025, 10, 28, 18, 30)))).toBe("closed");
});

test("timeUntilClose reflects the early 13:00 close on a half-day", () => {
  // From 12:00 ET (17:00 UTC) to 13:00 ET close = 1 hour.
  const ms = nyse.timeUntilClose(new Date(Date.UTC(2025, 10, 28, 17, 0)));
  expect(ms).toBe(60 * 60 * 1000);
});

test("nextSessions marks the half-day and uses its early close", () => {
  const s = nyse.nextSessions(new Date(Date.UTC(2025, 10, 28, 12, 0)), 1)[0]!;
  expect(s.date).toBe("2025-11-28");
  expect(s.halfDay).toBe(true);
  // close = 13:00 EST = 18:00 UTC.
  expect(s.close.getTime()).toBe(Date.UTC(2025, 10, 28, 18, 0));
});

// ---- countdowns (NSE, IST fixed offset) ----

test("timeUntilOpen counts down to the next regular open", () => {
  // 2025-06-16 (Mon) 08:00 IST = 02:30 UTC; open 09:15 IST = 03:45 UTC → 75 min.
  const ms = timeUntilOpen(NSE, new Date(Date.UTC(2025, 5, 16, 2, 30)));
  expect(ms).toBe(75 * 60 * 1000);
});

test("timeUntilClose from mid-session (NSE)", () => {
  // 10:30 IST = 05:00 UTC; close 15:30 IST = 10:00 UTC → 5 hours.
  const ms = timeUntilClose(NSE, new Date(Date.UTC(2025, 5, 16, 5, 0)));
  expect(ms).toBe(5 * 60 * 60 * 1000);
});

// ---- nextSessions skips a weekend + a holiday ----

test("nextSessions skips a weekend and a holiday", () => {
  // Thu 2025-08-14 16:30 IST = 11:00 UTC (after close). Fri 2025-08-15 is a
  // listed NSE holiday, 16/17 are the weekend → next session Mon 2025-08-18.
  const s = nse.nextSessions(new Date(Date.UTC(2025, 7, 14, 11, 0)), 1)[0]!;
  expect(s.date).toBe("2025-08-18");
  expect(s.open.getTime()).toBe(Date.UTC(2025, 7, 18, 3, 45)); // 09:15 IST
  expect(s.halfDay).toBe(false);
});

test("nextSessions returns N consecutive trading sessions", () => {
  const list = nse.nextSessions(new Date(Date.UTC(2025, 5, 16, 2, 0)), 3);
  expect(list.map((s) => s.date)).toEqual(["2025-06-16", "2025-06-17", "2025-06-18"]);
});

// ---- helpers ----

test("isTradingDay / isHoliday (standalone functions)", () => {
  // 2025-08-15 holiday.
  expect(isHoliday(NSE, new Date(Date.UTC(2025, 7, 15, 4, 30)))).toBe(true);
  expect(isTradingDay(NSE, new Date(Date.UTC(2025, 7, 15, 4, 30)))).toBe(false);
  // 2025-06-14 Saturday.
  expect(isTradingDay(NSE, new Date(Date.UTC(2025, 5, 14, 5, 0)))).toBe(false);
  // 2025-06-16 Monday, ordinary trading day.
  expect(isTradingDay(NSE, new Date(Date.UTC(2025, 5, 16, 5, 0)))).toBe(true);
  expect(isHalfDay(NSE, new Date(Date.UTC(2025, 5, 16, 5, 0)))).toBe(false);
});

test("sessionsBetween lists sessions with open in [a, b)", () => {
  // Mon 2025-06-16 00:00 UTC .. Thu 2025-06-19 00:00 UTC → Mon/Tue/Wed opens.
  const a = new Date(Date.UTC(2025, 5, 16, 0, 0));
  const b = new Date(Date.UTC(2025, 5, 19, 0, 0));
  const list = sessionsBetween(NSE, a, b);
  expect(list.map((s) => s.date)).toEqual(["2025-06-16", "2025-06-17", "2025-06-18"]);
  // reversed range → empty.
  expect(sessionsBetween(NSE, b, a)).toEqual([]);
});
