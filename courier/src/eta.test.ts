import { describe, it, expect } from "vitest";
import {
  estimateDelivery,
  addBusinessDays,
  isBusinessDay,
  businessDaysBetween,
  evaluateSla,
  DEFAULT_WEEKEND,
  CourierError,
} from "./index";

// Use local-time date constructors so getDay()/weekend logic is deterministic.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("business-day helpers", () => {
  it("knows weekends are not business days", () => {
    expect(isBusinessDay(d(2026, 1, 9))).toBe(true); // Friday
    expect(isBusinessDay(d(2026, 1, 10))).toBe(false); // Saturday
    expect(isBusinessDay(d(2026, 1, 11))).toBe(false); // Sunday
    expect(DEFAULT_WEEKEND).toEqual([0, 6]);
  });

  it("treats configured holidays as non-business days", () => {
    const holidays = [d(2026, 1, 12)]; // Monday
    expect(isBusinessDay(d(2026, 1, 12), { holidays })).toBe(false);
  });

  it("adds business days across a weekend", () => {
    // Friday + 1 business day -> Monday (skips Sat + Sun)
    const out = addBusinessDays(d(2026, 1, 9), 1);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(0);
    expect(out.getDate()).toBe(12);
  });

  it("subtracts business days for a negative count", () => {
    // Monday - 1 business day -> Friday
    const out = addBusinessDays(d(2026, 1, 12), -1);
    expect(out.getDate()).toBe(9);
  });

  it("counts business days between two dates", () => {
    // Mon 5th -> Mon 12th = 5 business days
    expect(businessDaysBetween(d(2026, 1, 5), d(2026, 1, 12))).toBe(5);
    expect(businessDaysBetween(d(2026, 1, 5), d(2026, 1, 5))).toBe(0);
  });
});

describe("estimateDelivery", () => {
  it("estimates an ETA skipping weekends", () => {
    // Ship Thursday 8th, 3 transit days -> Fri(1), Mon(2), Tue(3) = Jan 13
    const eta = estimateDelivery({ shipDate: d(2026, 1, 8), transitDays: 3 });
    expect(eta.getDate()).toBe(13);
  });

  it("skips holidays too", () => {
    // Ship Thursday 8th, 3 transit days, Monday 12th is a holiday -> Wed 14
    const eta = estimateDelivery({
      shipDate: d(2026, 1, 8),
      transitDays: 3,
      holidays: [d(2026, 1, 12)],
    });
    expect(eta.getDate()).toBe(14);
  });

  it("returns the ship date for 0 transit days", () => {
    const eta = estimateDelivery({ shipDate: d(2026, 1, 8), transitDays: 0 });
    expect(eta.getDate()).toBe(8);
  });

  it("rejects a negative or non-finite transitDays", () => {
    expect(() => estimateDelivery({ shipDate: d(2026, 1, 8), transitDays: -1 })).toThrow(
      CourierError,
    );
    expect(() => estimateDelivery({ shipDate: d(2026, 1, 8), transitDays: NaN })).toThrow(
      CourierError,
    );
  });

  it("throws a CourierError on an invalid ship date", () => {
    expect(() => estimateDelivery({ shipDate: "not-a-date", transitDays: 2 })).toThrow(
      CourierError,
    );
  });
});

describe("evaluateSla", () => {
  it("reports on-time when delivered before the due date", () => {
    const r = evaluateSla({
      due: "2026-01-05T23:59:59Z",
      deliveredAt: "2026-01-05T10:00:00Z",
    });
    expect(r.onTime).toBe(true);
    expect(r.late).toBe(false);
    expect(r.delivered).toBe(true);
    expect(r.deltaMs).toBeLessThan(0);
  });

  it("reports late when delivered after the due date", () => {
    const r = evaluateSla({
      due: "2026-01-05T00:00:00Z",
      deliveredAt: "2026-01-06T00:00:00Z",
    });
    expect(r.late).toBe(true);
    expect(r.onTime).toBe(false);
    expect(r.deltaMs).toBeGreaterThan(0);
  });

  it("measures an undelivered shipment against the injected clock", () => {
    const r = evaluateSla({
      due: "2026-01-05T00:00:00Z",
      now: () => Date.parse("2026-01-07T00:00:00Z"),
    });
    expect(r.delivered).toBe(false);
    expect(r.late).toBe(true);
  });
});
