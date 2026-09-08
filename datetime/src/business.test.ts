import { describe, it, expect } from "vitest";
import {
  isBusinessDay, addBusinessDays, subBusinessDays,
  nextBusinessDay, previousBusinessDay, businessDaysBetween, format,
} from "./index.js";

describe("business days", () => {
  it("isBusinessDay knows weekends", () => {
    expect(isBusinessDay(new Date(2021, 5, 18))).toBe(true);  // Friday
    expect(isBusinessDay(new Date(2021, 5, 19))).toBe(false); // Saturday
    expect(isBusinessDay(new Date(2021, 5, 20))).toBe(false); // Sunday
  });

  it("isBusinessDay honours injected holidays", () => {
    const holidays = [new Date(2021, 5, 18)];
    expect(isBusinessDay(new Date(2021, 5, 18), { holidays })).toBe(false);
    expect(isBusinessDay(new Date(2021, 5, 17), { holidays })).toBe(true);
  });

  it("addBusinessDays skips the weekend", () => {
    // Fri 2021-06-18 + 1 business day → Mon 2021-06-21
    expect(format(addBusinessDays(new Date(2021, 5, 18), 1), "YYYY-MM-DD")).toBe("2021-06-21");
    // Fri + 5 business days → next Fri
    expect(format(addBusinessDays(new Date(2021, 5, 18), 5), "YYYY-MM-DD")).toBe("2021-06-25");
  });

  it("addBusinessDays skips holidays too", () => {
    const holidays = [new Date(2021, 5, 21)]; // Monday off
    expect(format(addBusinessDays(new Date(2021, 5, 18), 1, { holidays }), "YYYY-MM-DD")).toBe("2021-06-22");
  });

  it("addBusinessDays preserves the time-of-day", () => {
    expect(format(addBusinessDays(new Date(2021, 5, 18, 9, 30), 1), "YYYY-MM-DD HH:mm")).toBe("2021-06-21 09:30");
  });

  it("subBusinessDays / previous / next", () => {
    // Mon 2021-06-21 − 1 business day → Fri 2021-06-18
    expect(format(subBusinessDays(new Date(2021, 5, 21), 1), "YYYY-MM-DD")).toBe("2021-06-18");
    expect(format(nextBusinessDay(new Date(2021, 5, 18)), "YYYY-MM-DD")).toBe("2021-06-21");
    expect(format(previousBusinessDay(new Date(2021, 5, 21)), "YYYY-MM-DD")).toBe("2021-06-18");
  });

  it("addBusinessDays with n=0 is a no-op even on a weekend", () => {
    const sat = new Date(2021, 5, 19, 8, 0);
    expect(addBusinessDays(sat, 0).getTime()).toBe(sat.getTime());
  });

  it("businessDaysBetween counts working days, signed", () => {
    // Mon 06-14 → Mon 06-21: Tue..Fri (4) + Mon (1) = 5
    expect(businessDaysBetween(new Date(2021, 5, 14), new Date(2021, 5, 21))).toBe(5);
    expect(businessDaysBetween(new Date(2021, 5, 21), new Date(2021, 5, 14))).toBe(-5);
    expect(businessDaysBetween(new Date(2021, 5, 14), new Date(2021, 5, 14))).toBe(0);
  });

  it("businessDaysBetween respects holidays", () => {
    const holidays = [new Date(2021, 5, 18)]; // that Friday off
    expect(businessDaysBetween(new Date(2021, 5, 14), new Date(2021, 5, 21), { holidays })).toBe(4);
  });

  it("supports custom weekends (e.g. Fri+Sat)", () => {
    const weekends: (0 | 5 | 6)[] = [5, 6];
    expect(isBusinessDay(new Date(2021, 5, 20), { weekends })).toBe(true);  // Sunday now works
    expect(isBusinessDay(new Date(2021, 5, 18), { weekends })).toBe(false); // Friday now off
  });
});
