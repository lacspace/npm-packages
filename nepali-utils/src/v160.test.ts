import { expect, test } from "vitest";
import { formatCompactNPR, formatNPR, formatNpt, fromNpt, groupNepali, toNpt, toNptIso } from "./index";

test("groupNepali keeps decimals (1.6.0 fix)", () => {
  expect(groupNepali(2587.25)).toBe("2,587.25");
  expect(groupNepali("1234567.5")).toBe("12,34,567.5");
  expect(groupNepali(-1234567)).toBe("-12,34,567");
  expect(formatNPR(4293774181)).toBe("Rs. 4,29,37,74,181.00");
});

test("formatCompactNPR long style + fixed decimals", () => {
  expect(formatCompactNPR(4293774181, { symbol: "Rs ", style: "long", decimals: 2 })).toBe("Rs 4.29 Arba");
  expect(formatCompactNPR(4293774181, { symbol: "रु ", style: "long", nepali: true, devanagari: true, decimals: 2 })).toBe("रु ४.२९ अर्ब");
  expect(formatCompactNPR(25e7, { style: "long" })).toBe("Rs. 25 Crore");
  expect(formatCompactNPR(4293774181)).toBe("Rs. 4.29 Arab"); // default unchanged
});

test("Nepal time (UTC+05:45)", () => {
  const open = fromNpt(2026, 10, 4, 11, 0);
  expect(open.toISOString()).toBe("2026-10-04T05:15:00.000Z");
  expect(toNpt(open)).toMatchObject({ hour: 11, minute: 0, weekday: 0 });
  expect(formatNpt(fromNpt(2026, 10, 4, 15, 0), { time: true, hour12: true })).toBe("3:00 PM");
  expect(formatNpt(open, { devanagari: true })).toBe("२०२६-१०-०४ ११:००");
  expect(toNptIso(open)).toBe("2026-10-04T11:00:00+05:45");
  // crossing midnight UTC
  expect(toNpt(new Date("2026-10-03T18:30:00Z"))).toMatchObject({ day: 4, hour: 0, minute: 15 });
});
