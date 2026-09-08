import { describe, it, expect } from "vitest";
import { formatInZone, getAbbreviation } from "./index";

const WINTER = Date.UTC(2024, 0, 15, 12, 0, 0); // 2024-01-15T12:00:00Z
const SUMMER = Date.UTC(2024, 6, 15, 12, 0, 0); // 2024-07-15T12:00:00Z

describe("formatInZone", () => {
  it("uses a deterministic default format in the target zone (Kathmandu 17:45)", () => {
    const s = formatInZone(WINTER, "Asia/Kathmandu");
    expect(typeof s).toBe("string");
    expect(s).toContain("2024");
    expect(s).toContain("17:45");
  });

  it("honours explicit Intl options (New York winter → 07:00)", () => {
    const s = formatInZone(WINTER, "America/New_York", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(s).toBe("07:00");
  });

  it("lets the zone argument win over a timeZone in options", () => {
    // options.timeZone Tokyo is ignored; the `zone` arg (UTC) is authoritative.
    const s = formatInZone(WINTER, "UTC", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    });
    expect(s).toBe("12:00");
  });

  it("supports a custom locale without breaking", () => {
    const s = formatInZone(SUMMER, "UTC", { locale: "fr-FR", dateStyle: "long" });
    expect(typeof s).toBe("string");
    expect(s).toContain("2024");
  });
});

describe("getAbbreviation", () => {
  it("returns EST for New York in winter, EDT in summer (DST-aware)", () => {
    expect(getAbbreviation("America/New_York", WINTER)).toBe("EST");
    expect(getAbbreviation("America/New_York", SUMMER)).toBe("EDT");
  });

  it("returns the long descriptive name with style: long", () => {
    expect(getAbbreviation("America/New_York", WINTER, "long")).toBe("Eastern Standard Time");
  });

  it("returns UTC for the UTC zone", () => {
    expect(getAbbreviation("UTC", WINTER)).toBe("UTC");
  });

  it("returns a non-empty string for zones without a named abbreviation", () => {
    const abbr = getAbbreviation("Asia/Kathmandu", WINTER);
    expect(typeof abbr).toBe("string");
    expect(abbr.length).toBeGreaterThan(0);
  });
});
