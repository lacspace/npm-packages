import { describe, it, expect } from "vitest";
import { compareZones, offsetDifference } from "./index";

const WINTER = Date.UTC(2024, 0, 15, 12, 0, 0); // 2024-01-15T12:00:00Z
const SUMMER = Date.UTC(2024, 6, 15, 12, 0, 0); // 2024-07-15T12:00:00Z

describe("compareZones", () => {
  it("reports Kathmandu ahead of UTC by 345 minutes (5.75h)", () => {
    const c = compareZones("Asia/Kathmandu", "UTC", WINTER);
    expect(c.offsetA).toBe(345);
    expect(c.offsetB).toBe(0);
    expect(c.differenceMinutes).toBe(345);
    expect(c.differenceHours).toBeCloseTo(5.75, 10);
    expect(c.ahead).toBe("A");
  });

  it("is symmetric: UTC vs Kathmandu is behind (ahead === 'B')", () => {
    const c = compareZones("UTC", "Asia/Kathmandu", WINTER);
    expect(c.differenceMinutes).toBe(-345);
    expect(c.ahead).toBe("B");
  });

  it("reports 'same' for identical offsets", () => {
    const c = compareZones("UTC", "UTC", WINTER);
    expect(c.differenceMinutes).toBe(0);
    expect(c.differenceHours).toBe(0);
    expect(c.ahead).toBe("same");
  });

  it("is DST-aware (New York vs Kathmandu differs across seasons)", () => {
    // Winter: NY -300, KTM 345 → -645
    expect(compareZones("America/New_York", "Asia/Kathmandu", WINTER).differenceMinutes).toBe(-645);
    // Summer: NY -240, KTM 345 → -585 (NY sprang forward, KTM has no DST)
    expect(compareZones("America/New_York", "Asia/Kathmandu", SUMMER).differenceMinutes).toBe(-585);
  });

  it("carries both raw offsets and the zone ids through", () => {
    const c = compareZones("Asia/Tokyo", "America/New_York", SUMMER);
    expect(c.zoneA).toBe("Asia/Tokyo");
    expect(c.zoneB).toBe("America/New_York");
    expect(c.offsetA).toBe(540); // JST, no DST
    expect(c.offsetB).toBe(-240); // EDT
    expect(c.ahead).toBe("A");
  });
});

describe("offsetDifference", () => {
  it("equals compareZones(...).differenceMinutes", () => {
    expect(offsetDifference("Asia/Tokyo", "America/New_York", SUMMER)).toBe(780);
    expect(offsetDifference("America/New_York", "Asia/Tokyo", SUMMER)).toBe(-780);
  });
});
