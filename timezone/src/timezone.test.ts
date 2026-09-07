import { describe, it, expect } from "vitest";
import {
  getOffset,
  getOffsetString,
  zonedParts,
  fromZoned,
  toZone,
  convert,
  listTimeZones,
  isValidTimeZone,
  getSystemTimeZone,
  isDST,
  nextTransition,
  FALLBACK_TIME_ZONES,
} from "./index";

// Fixed UTC instants so every test is deterministic regardless of the machine.
const WINTER = Date.UTC(2024, 0, 15, 12, 0, 0); // 2024-01-15T12:00:00Z (N. hemisphere winter)
const SUMMER = Date.UTC(2024, 6, 15, 12, 0, 0); // 2024-07-15T12:00:00Z (N. hemisphere summer)

describe("getOffset — known fixed offsets", () => {
  it("Asia/Kathmandu is +05:45 (345 min), no DST", () => {
    expect(getOffset("Asia/Kathmandu", WINTER)).toBe(345);
    expect(getOffset("Asia/Kathmandu", SUMMER)).toBe(345);
  });

  it("Asia/Kolkata is +05:30 (330 min), no DST", () => {
    expect(getOffset("Asia/Kolkata", WINTER)).toBe(330);
    expect(getOffset("Asia/Kolkata", SUMMER)).toBe(330);
  });

  it("America/New_York is -05:00 in winter (EST), -04:00 in summer (EDT)", () => {
    expect(getOffset("America/New_York", WINTER)).toBe(-300);
    expect(getOffset("America/New_York", SUMMER)).toBe(-240);
  });

  it("Europe/London is +00:00 in winter, +01:00 in summer (BST)", () => {
    expect(getOffset("Europe/London", WINTER)).toBe(0);
    expect(getOffset("Europe/London", SUMMER)).toBe(60);
  });

  it("Australia/Sydney is +11:00 in Jan (DST), +10:00 in Jul", () => {
    expect(getOffset("Australia/Sydney", WINTER)).toBe(660);
    expect(getOffset("Australia/Sydney", SUMMER)).toBe(600);
  });

  it("UTC is always 0", () => {
    expect(getOffset("UTC", WINTER)).toBe(0);
    expect(getOffset("UTC", SUMMER)).toBe(0);
  });

  it("defaults to now when no instant is given", () => {
    expect(typeof getOffset("Asia/Kolkata")).toBe("number");
    expect(getOffset("Asia/Kolkata")).toBe(330); // Kolkata has no DST, stable
  });

  it("accepts a Date as well as epoch millis", () => {
    expect(getOffset("Asia/Kathmandu", new Date(WINTER))).toBe(345);
  });
});

describe("getOffsetString", () => {
  it("formats +05:45", () => {
    expect(getOffsetString("Asia/Kathmandu", WINTER)).toBe("+05:45");
  });
  it("formats +05:30", () => {
    expect(getOffsetString("Asia/Kolkata", WINTER)).toBe("+05:30");
  });
  it("formats negative offsets", () => {
    expect(getOffsetString("America/New_York", WINTER)).toBe("-05:00");
    expect(getOffsetString("America/New_York", SUMMER)).toBe("-04:00");
  });
  it("formats zero as +00:00", () => {
    expect(getOffsetString("UTC", WINTER)).toBe("+00:00");
  });
});

describe("zonedParts", () => {
  it("breaks down a UTC instant into Kathmandu wall time", () => {
    // 2024-01-15T12:00:00Z + 05:45 = 17:45 local
    const p = zonedParts(WINTER, "Asia/Kathmandu");
    expect(p).toMatchObject({
      year: 2024,
      month: 1,
      day: 15,
      hour: 17,
      minute: 45,
      second: 0,
      offsetMinutes: 345,
    });
  });

  it("month is 1-indexed", () => {
    expect(zonedParts(SUMMER, "UTC").month).toBe(7);
  });

  it("weekday is 0=Sun..6=Sat (2024-01-15 is a Monday)", () => {
    expect(zonedParts(WINTER, "UTC").weekday).toBe(1);
  });

  it("rolls the day back across the date line when offset is negative", () => {
    // 2024-01-15T12:00:00Z − 05:00 = 07:00 local, same day
    const p = zonedParts(WINTER, "America/New_York");
    expect(p.day).toBe(15);
    expect(p.hour).toBe(7);
  });

  it("rolls to the previous day for early-UTC / far-west instants", () => {
    // 2024-01-15T02:00:00Z in New York (−05:00) = 2024-01-14 21:00
    const early = Date.UTC(2024, 0, 15, 2, 0, 0);
    const p = zonedParts(early, "America/New_York");
    expect(p.day).toBe(14);
    expect(p.hour).toBe(21);
  });

  it("exposes an abbreviation string", () => {
    expect(typeof zonedParts(WINTER, "America/New_York").abbreviation).toBe("string");
    expect(zonedParts(WINTER, "America/New_York").abbreviation.length).toBeGreaterThan(0);
  });
});

describe("fromZoned — inverse of zonedParts", () => {
  it("round-trips zonedParts back to the same instant (no-DST zone)", () => {
    const parts = zonedParts(WINTER, "Asia/Kathmandu");
    const back = fromZoned(parts, "Asia/Kathmandu");
    expect(back.getTime()).toBe(WINTER);
  });

  it("round-trips through a DST zone in winter", () => {
    const parts = zonedParts(WINTER, "America/New_York");
    expect(fromZoned(parts, "America/New_York").getTime()).toBe(WINTER);
  });

  it("round-trips through a DST zone in summer", () => {
    const parts = zonedParts(SUMMER, "America/New_York");
    expect(fromZoned(parts, "America/New_York").getTime()).toBe(SUMMER);
  });

  it("round-trips a southern-hemisphere DST zone", () => {
    const parts = zonedParts(WINTER, "Australia/Sydney");
    expect(fromZoned(parts, "Australia/Sydney").getTime()).toBe(WINTER);
  });

  it("interprets explicit wall fields correctly (Kathmandu noon → 06:15Z)", () => {
    // 12:00 local − 05:45 = 06:15 UTC
    const d = fromZoned({ year: 2024, month: 6, day: 1, hour: 12, minute: 0 }, "Asia/Kathmandu");
    expect(d.getTime()).toBe(Date.UTC(2024, 5, 1, 6, 15, 0));
  });

  it("interprets New York summer wall time with the EDT offset (−04:00)", () => {
    // 2024-07-15 08:00 EDT = 12:00 UTC
    const d = fromZoned({ year: 2024, month: 7, day: 15, hour: 8 }, "America/New_York");
    expect(d.getTime()).toBe(SUMMER);
  });

  it("defaults missing hour/minute/second/ms to 0", () => {
    const d = fromZoned({ year: 2024, month: 1, day: 1 }, "UTC");
    expect(d.getTime()).toBe(Date.UTC(2024, 0, 1, 0, 0, 0, 0));
  });

  it("preserves milliseconds", () => {
    const d = fromZoned({ year: 2024, month: 1, day: 1, hour: 0, ms: 123 }, "UTC");
    expect(d.getMilliseconds()).toBe(123);
    expect(d.getTime()).toBe(Date.UTC(2024, 0, 1, 0, 0, 0, 123));
  });

  it("resolves a nonexistent spring-forward wall time to a real, valid instant", () => {
    // 2024-03-10 02:30 does not exist in New York (clocks jump 02:00→03:00).
    const d = fromZoned({ year: 2024, month: 3, day: 10, hour: 2, minute: 30 }, "America/New_York");
    expect(Number.isNaN(d.getTime())).toBe(false);
    // Documented behavior: the two-pass lands it on the pre-gap side, so its own
    // parts read one gap-length earlier — 01:30 EST — not the nonexistent 02:30.
    const p = zonedParts(d, "America/New_York");
    expect(p.hour).toBe(1);
    expect(p.minute).toBe(30);
    expect(p.abbreviation).toBe("EST");
  });

  it("maps an ambiguous fall-back wall time to a single valid instant", () => {
    // 2024-11-03 01:30 occurs twice in New York (clocks fall 02:00→01:00).
    const d = fromZoned({ year: 2024, month: 11, day: 3, hour: 1, minute: 30 }, "America/New_York");
    expect(Number.isNaN(d.getTime())).toBe(false);
    const p = zonedParts(d, "America/New_York");
    expect(p.hour).toBe(1);
    expect(p.minute).toBe(30);
  });
});

describe("toZone", () => {
  it("returns the same instant plus its parts", () => {
    const r = toZone(WINTER, "Asia/Kolkata");
    expect(r.date.getTime()).toBe(WINTER);
    expect(r.parts.offsetMinutes).toBe(330);
    expect(r.parts.hour).toBe(17); // 12:00Z + 5:30 = 17:30
    expect(r.parts.minute).toBe(30);
  });
});

describe("convert", () => {
  it("re-expresses one instant in two zones (instant unchanged)", () => {
    const r = convert(SUMMER, "America/New_York", "Asia/Tokyo");
    expect(r.date.getTime()).toBe(SUMMER);
    expect(r.from.offsetMinutes).toBe(-240); // EDT
    expect(r.to.offsetMinutes).toBe(540); // JST +09:00, no DST
    // 12:00Z in Tokyo = 21:00
    expect(r.to.hour).toBe(21);
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Kathmandu")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });
  it("rejects garbage and non-strings", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(123)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe("listTimeZones", () => {
  it("returns a non-empty array containing major zones", () => {
    const zones = listTimeZones();
    expect(Array.isArray(zones)).toBe(true);
    expect(zones.length).toBeGreaterThan(10);
    // Use zones whose canonical id is stable across ICU versions. (Some older
    // ICU builds list "Asia/Katmandu" for Kathmandu / "Asia/Calcutta" for
    // Kolkata; both still resolve via getOffset, but the list spelling varies.)
    expect(zones).toContain("America/New_York");
    expect(zones).toContain("Europe/London");
    expect(zones).toContain("Asia/Tokyo");
  });

  it("every listed zone validates", () => {
    for (const z of listTimeZones().slice(0, 30)) {
      expect(isValidTimeZone(z)).toBe(true);
    }
  });

  it("fallback list is itself valid and covers common zones", () => {
    expect(FALLBACK_TIME_ZONES).toContain("UTC");
    expect(FALLBACK_TIME_ZONES).toContain("Asia/Kolkata");
    for (const z of FALLBACK_TIME_ZONES) expect(isValidTimeZone(z)).toBe(true);
  });
});

describe("getSystemTimeZone", () => {
  it("returns a valid IANA zone string", () => {
    const tz = getSystemTimeZone();
    expect(typeof tz).toBe("string");
    expect(isValidTimeZone(tz)).toBe(true);
  });
});

describe("isDST", () => {
  it("New York: DST in July, standard in January", () => {
    expect(isDST("America/New_York", SUMMER)).toBe(true);
    expect(isDST("America/New_York", WINTER)).toBe(false);
  });
  it("Sydney (southern hemisphere): DST in January, standard in July", () => {
    expect(isDST("Australia/Sydney", WINTER)).toBe(true);
    expect(isDST("Australia/Sydney", SUMMER)).toBe(false);
  });
  it("zones without DST are always false", () => {
    expect(isDST("Asia/Kathmandu", WINTER)).toBe(false);
    expect(isDST("Asia/Kathmandu", SUMMER)).toBe(false);
    expect(isDST("Asia/Kolkata", SUMMER)).toBe(false);
    expect(isDST("UTC", SUMMER)).toBe(false);
  });
});

describe("nextTransition", () => {
  it("finds the New York spring-forward at 2024-03-10T07:00:00Z (EST→EDT)", () => {
    const from = Date.UTC(2024, 2, 1, 0, 0, 0); // 2024-03-01
    const t = nextTransition("America/New_York", from);
    expect(t).not.toBeNull();
    expect(t!.at.getTime()).toBe(Date.UTC(2024, 2, 10, 7, 0, 0));
    expect(t!.offsetBefore).toBe(-300); // EST
    expect(t!.offsetAfter).toBe(-240); // EDT
  });

  it("finds the New York fall-back at 2024-11-03T06:00:00Z (EDT→EST)", () => {
    const from = Date.UTC(2024, 9, 1, 0, 0, 0); // 2024-10-01
    const t = nextTransition("America/New_York", from);
    expect(t).not.toBeNull();
    expect(t!.at.getTime()).toBe(Date.UTC(2024, 10, 3, 6, 0, 0));
    expect(t!.offsetBefore).toBe(-240); // EDT
    expect(t!.offsetAfter).toBe(-300); // EST
  });

  it("returns null for a zone with no upcoming transition", () => {
    const from = Date.UTC(2024, 0, 1, 0, 0, 0);
    expect(nextTransition("Asia/Kathmandu", from)).toBeNull();
    expect(nextTransition("Asia/Kolkata", from)).toBeNull();
  });

  it("pins the transition to the second and the offset flips exactly there", () => {
    const from = Date.UTC(2024, 2, 1, 0, 0, 0);
    const t = nextTransition("America/New_York", from)!;
    const at = t.at.getTime();
    expect(getOffset("America/New_York", at - 1000)).toBe(t.offsetBefore);
    expect(getOffset("America/New_York", at)).toBe(t.offsetAfter);
  });
});
