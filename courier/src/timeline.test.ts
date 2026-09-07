import { describe, it, expect } from "vitest";
import {
  summarizeTimeline,
  sortTrackingEvents,
  type TrackingEvent,
  type DeliveryStatus,
} from "./index";

const ev = (status: DeliveryStatus, timestamp: string): TrackingEvent => ({ status, timestamp });

describe("sortTrackingEvents", () => {
  it("orders events oldest -> newest without mutating the input", () => {
    const input = [
      ev("delivered", "2026-01-03T10:00:00Z"),
      ev("confirmed", "2026-01-01T10:00:00Z"),
      ev("in_transit", "2026-01-02T10:00:00Z"),
    ];
    const sorted = sortTrackingEvents(input);
    expect(sorted.map((e) => e.status)).toEqual(["confirmed", "in_transit", "delivered"]);
    expect(input[0]!.status).toBe("delivered"); // original untouched
  });
});

describe("summarizeTimeline", () => {
  it("derives the current status from the newest event", () => {
    const s = summarizeTimeline({
      events: [
        ev("in_transit", "2026-01-02T10:00:00Z"),
        ev("confirmed", "2026-01-01T10:00:00Z"),
        ev("out_for_delivery", "2026-01-03T08:00:00Z"),
      ],
    });
    expect(s.currentStatus).toBe("out_for_delivery");
    expect(s.eventCount).toBe(3);
    expect(s.isDelivered).toBe(false);
    expect(s.isTerminal).toBe(false);
  });

  it("flags delivery + records deliveredAt / actualDelivery", () => {
    const s = summarizeTimeline({
      trackingId: "DA99",
      carrier: "pathao",
      events: [
        ev("confirmed", "2026-01-01T10:00:00Z"),
        ev("delivered", "2026-01-03T14:00:00Z"),
      ],
    });
    expect(s.isDelivered).toBe(true);
    expect(s.isTerminal).toBe(true);
    expect(s.deliveredAt?.toISOString()).toBe("2026-01-03T14:00:00.000Z");
    expect(s.actualDelivery).toEqual(s.deliveredAt);
    expect(s.trackingId).toBe("DA99");
  });

  it("computes on-time when delivered on/before the promised date", () => {
    const s = summarizeTimeline({
      events: [ev("delivered", "2026-01-03T09:00:00Z")],
      promisedBy: "2026-01-03T23:59:59Z",
    });
    expect(s.onTime).toBe(true);
    expect(s.isLate).toBe(false);
  });

  it("computes late when delivered after the promised date", () => {
    const s = summarizeTimeline({
      events: [ev("delivered", "2026-01-05T09:00:00Z")],
      estimatedDelivery: "2026-01-03T23:59:59Z",
    });
    expect(s.onTime).toBe(false);
  });

  it("flags an undelivered shipment as late using the injected clock", () => {
    const s = summarizeTimeline(
      {
        events: [ev("in_transit", "2026-01-02T10:00:00Z")],
        promisedBy: "2026-01-03T00:00:00Z",
      },
      { now: () => Date.parse("2026-01-04T00:00:00Z") },
    );
    expect(s.isLate).toBe(true);
    expect(s.isDelivered).toBe(false);
  });

  it("handles an empty timeline gracefully", () => {
    const s = summarizeTimeline({ events: [] });
    expect(s.currentStatus).toBeUndefined();
    expect(s.isDelivered).toBe(false);
    expect(s.isLate).toBe(false);
    expect(s.eventCount).toBe(0);
    expect(s.onTime).toBeUndefined();
  });

  it("accepts epoch-ms and Date timestamps too", () => {
    const s = summarizeTimeline({
      events: [
        { status: "confirmed", timestamp: new Date("2026-01-01T00:00:00Z") },
        { status: "delivered", timestamp: Date.parse("2026-01-02T00:00:00Z") },
      ],
    });
    expect(s.currentStatus).toBe("delivered");
    expect(s.isDelivered).toBe(true);
  });
});
