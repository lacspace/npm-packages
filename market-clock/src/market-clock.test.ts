import { test, expect } from "vitest";
import { NSE, BSE, createClock } from "./index";

const nse = createClock(NSE);
const bse = createClock(BSE);

// 2025-06-16 is a Monday (not a holiday). IST = UTC + 5:30.
// 10:00 IST = 04:30 UTC (open); 16:00 IST = 10:30 UTC (closed after 15:30).
const openInstant = new Date(Date.UTC(2025, 5, 16, 4, 30));
const closedInstant = new Date(Date.UTC(2025, 5, 16, 10, 30));

test("NSE/BSE open at a known open timestamp", () => {
  expect(nse.isOpen(openInstant)).toBe(true);
  expect(bse.isOpen(openInstant)).toBe(true);
  expect(nse.status(openInstant)).toBe("open");
});

test("NSE closed at a known closed timestamp (same day, after close)", () => {
  expect(nse.isOpen(closedInstant)).toBe(false);
  expect(nse.status(closedInstant)).toBe("closed");
});

test("weekend is closed", () => {
  // 2025-06-14 is a Saturday. 10:30 IST.
  const sat = new Date(Date.UTC(2025, 5, 14, 5, 0));
  expect(nse.isWeekend(sat)).toBe(true);
  expect(nse.isOpen(sat)).toBe(false);
});

test("a holiday is closed", () => {
  // 2025-08-15 is a listed NSE holiday. 10:00 IST = 04:30 UTC.
  const holiday = new Date(Date.UTC(2025, 7, 15, 4, 30));
  expect(nse.isHoliday(holiday)).toBe(true);
  expect(nse.isTradingDay(holiday)).toBe(false);
  expect(nse.isOpen(holiday)).toBe(false);
});

test("nextOpen after a closed time lands on the next trading day's open", () => {
  // From Mon 2025-06-16 closed -> Tue 2025-06-17 09:15 IST = 03:45 UTC.
  const next = nse.nextOpen(closedInstant);
  expect(next.getTime()).toBe(Date.UTC(2025, 5, 17, 3, 45, 0));
});
