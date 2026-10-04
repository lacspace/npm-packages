import { expect, test } from "vitest";
import { MarketClock, NEPSE, PRESETS, withHolidays } from "./index";

// NPT = UTC+05:45 → 11:00 NPT = 05:15Z, 15:00 NPT = 09:15Z, 10:30 NPT = 04:45Z.
const npt = (iso: string) => new Date(iso + "+05:45");

test("NEPSE: Sun–Thu 11:00–15:00 NPT, pre-open 10:30–10:45", () => {
  const c = new MarketClock(NEPSE);
  expect(PRESETS.NEPSE).toBe(NEPSE);
  expect(c.status(npt("2026-10-04T10:35:00"))).toBe("pre-open"); // Sunday
  expect(c.status(npt("2026-10-04T10:50:00"))).toBe("closed"); // gap before the open
  expect(c.status(npt("2026-10-04T11:00:00"))).toBe("open");
  expect(c.status(npt("2026-10-04T14:59:00"))).toBe("open");
  expect(c.status(npt("2026-10-04T15:00:00"))).toBe("closed");
  expect(c.isOpen(npt("2026-10-08T12:00:00"))).toBe(true); // Thursday
  expect(c.isOpen(npt("2026-10-09T12:00:00"))).toBe(false); // Friday
  expect(c.isOpen(npt("2026-10-10T12:00:00"))).toBe(false); // Saturday
  expect(c.nextOpen(npt("2026-10-08T16:00:00")).toISOString()).toBe(npt("2026-10-11T11:00:00").toISOString()); // Thu after close → Sun
});

test("withHolidays adds an updatable holiday list", () => {
  const c = new MarketClock(withHolidays(NEPSE, ["2026-10-04"]));
  expect(c.isHoliday(npt("2026-10-04T12:00:00"))).toBe(true);
  expect(c.isOpen(npt("2026-10-04T12:00:00"))).toBe(false);
  expect(c.nextOpen(npt("2026-10-04T09:00:00")).toISOString()).toBe(npt("2026-10-05T11:00:00").toISOString());
  expect(NEPSE.holidays).toEqual([]); // original untouched
});
