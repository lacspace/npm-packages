import { describe, it, expect } from "vitest";
import {
  interval,
  isValidInterval,
  durationMs,
  contains,
  overlaps,
  abuts,
  isEqual,
  intersection,
  union,
  difference,
  gap,
  clampDate,
  split,
  mergeIntervals,
  intersectAll,
  invert,
  eachDayOfInterval,
  eachHourOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachOfInterval,
  isBusinessDay,
  addBusinessDays,
  subtractBusinessDays,
  nextBusinessDay,
  prevBusinessDay,
  businessDaysBetween,
  eachBusinessDayOfInterval,
  isSameDay,
} from "./index";

// Fixed UTC helpers for determinism regardless of host timezone.
const d = (s: string) => new Date(s);
const iv = (a: string, b: string) => interval(d(a), d(b));
const iso = (x: Date) => x.toISOString();

// A workweek in Jan 2026: Mon 2026-01-05 … Sun 2026-01-11.
// 2026-01-01 is a Thursday.

describe("interval() / isValidInterval()", () => {
  it("normalizes reversed args so start <= end", () => {
    const r = interval(d("2026-01-10T00:00:00Z"), d("2026-01-01T00:00:00Z"));
    expect(iso(r.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(r.end)).toBe("2026-01-10T00:00:00.000Z");
  });

  it("accepts epoch-ms numbers", () => {
    const r = interval(0, 1000);
    expect(r.start.getTime()).toBe(0);
    expect(r.end.getTime()).toBe(1000);
  });

  it("copies endpoints defensively (no aliasing)", () => {
    const start = d("2026-01-01T00:00:00Z");
    const r = interval(start, d("2026-01-02T00:00:00Z"));
    start.setUTCFullYear(2000);
    expect(r.start.getUTCFullYear()).toBe(2026);
  });

  it("validates real intervals and rejects junk", () => {
    expect(isValidInterval(iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"))).toBe(true);
    expect(isValidInterval({ start: new Date("bad"), end: new Date() })).toBe(false);
    expect(isValidInterval(null)).toBe(false);
    expect(isValidInterval({ start: 1, end: 2 })).toBe(false);
  });

  it("durationMs measures the span", () => {
    expect(durationMs(iv("2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"))).toBe(3_600_000);
  });
});

describe("contains() — half-open [start, end)", () => {
  const a = iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
  it("includes the start instant", () => {
    expect(contains(a, d("2026-01-01T00:00:00Z"))).toBe(true);
  });
  it("excludes the end instant", () => {
    expect(contains(a, d("2026-01-02T00:00:00Z"))).toBe(false);
  });
  it("includes interior instants and excludes outside", () => {
    expect(contains(a, d("2026-01-01T12:00:00Z"))).toBe(true);
    expect(contains(a, d("2025-12-31T23:59:59Z"))).toBe(false);
  });
});

describe("overlaps / abuts truth table (half-open)", () => {
  const a = iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z");
  it("true when ranges share interior", () => {
    expect(overlaps(a, iv("2026-01-05T00:00:00Z", "2026-01-15T00:00:00Z"))).toBe(true);
  });
  it("false when merely touching (abutting)", () => {
    const b = iv("2026-01-10T00:00:00Z", "2026-01-20T00:00:00Z");
    expect(overlaps(a, b)).toBe(false);
    expect(abuts(a, b)).toBe(true);
  });
  it("false when fully disjoint", () => {
    const b = iv("2026-02-01T00:00:00Z", "2026-02-05T00:00:00Z");
    expect(overlaps(a, b)).toBe(false);
    expect(abuts(a, b)).toBe(false);
  });
  it("true when one contains the other", () => {
    expect(overlaps(a, iv("2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"))).toBe(true);
  });
});

describe("intersection()", () => {
  it("returns the overlapping middle", () => {
    const r = intersection(
      iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"),
      iv("2026-01-05T00:00:00Z", "2026-01-15T00:00:00Z")
    );
    expect(iso(r!.start)).toBe("2026-01-05T00:00:00.000Z");
    expect(iso(r!.end)).toBe("2026-01-10T00:00:00.000Z");
  });
  it("returns null for touching intervals (empty overlap)", () => {
    expect(
      intersection(
        iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"),
        iv("2026-01-10T00:00:00Z", "2026-01-20T00:00:00Z")
      )
    ).toBeNull();
  });
  it("returns null for disjoint intervals", () => {
    expect(
      intersection(
        iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
        iv("2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z")
      )
    ).toBeNull();
  });
});

describe("union()", () => {
  it("merges overlapping into the outer span", () => {
    const r = union(
      iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"),
      iv("2026-01-05T00:00:00Z", "2026-01-15T00:00:00Z")
    );
    expect(iso(r!.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(r!.end)).toBe("2026-01-15T00:00:00.000Z");
  });
  it("merges abutting intervals", () => {
    const r = union(
      iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"),
      iv("2026-01-10T00:00:00Z", "2026-01-20T00:00:00Z")
    );
    expect(iso(r!.end)).toBe("2026-01-20T00:00:00.000Z");
  });
  it("returns null when disjoint", () => {
    expect(
      union(
        iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
        iv("2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z")
      )
    ).toBeNull();
  });
});

describe("difference()", () => {
  const a = iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z");
  it("returns whole a when disjoint", () => {
    const r = difference(a, iv("2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z"));
    expect(r).toHaveLength(1);
    expect(isEqual(r[0]!, a)).toBe(true);
  });
  it("splits into two when b sits inside a", () => {
    const r = difference(a, iv("2026-01-04T00:00:00Z", "2026-01-06T00:00:00Z"));
    expect(r).toHaveLength(2);
    expect(iso(r[0]!.end)).toBe("2026-01-04T00:00:00.000Z");
    expect(iso(r[1]!.start)).toBe("2026-01-06T00:00:00.000Z");
  });
  it("trims the left when b overlaps the start", () => {
    const r = difference(a, iv("2025-12-20T00:00:00Z", "2026-01-04T00:00:00Z"));
    expect(r).toHaveLength(1);
    expect(iso(r[0]!.start)).toBe("2026-01-04T00:00:00.000Z");
    expect(iso(r[0]!.end)).toBe("2026-01-10T00:00:00.000Z");
  });
  it("returns empty when b fully covers a", () => {
    expect(difference(a, iv("2025-12-01T00:00:00Z", "2026-02-01T00:00:00Z"))).toHaveLength(0);
  });
});

describe("gap()", () => {
  it("returns the space between disjoint intervals (order-independent)", () => {
    const a = iv("2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z");
    const b = iv("2026-01-10T00:00:00Z", "2026-01-12T00:00:00Z");
    const g = gap(a, b)!;
    expect(iso(g.start)).toBe("2026-01-05T00:00:00.000Z");
    expect(iso(g.end)).toBe("2026-01-10T00:00:00.000Z");
    expect(isEqual(gap(b, a)!, g)).toBe(true);
  });
  it("returns null for overlapping or abutting", () => {
    expect(
      gap(iv("2026-01-01T00:00:00Z", "2026-01-06T00:00:00Z"), iv("2026-01-05T00:00:00Z", "2026-01-09T00:00:00Z"))
    ).toBeNull();
    expect(
      gap(iv("2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z"), iv("2026-01-05T00:00:00Z", "2026-01-09T00:00:00Z"))
    ).toBeNull();
  });
});

describe("clampDate()", () => {
  const a = iv("2026-01-05T00:00:00Z", "2026-01-10T00:00:00Z");
  it("clamps below, above, and passes interior through", () => {
    expect(iso(clampDate(a, d("2026-01-01T00:00:00Z")))).toBe("2026-01-05T00:00:00.000Z");
    expect(iso(clampDate(a, d("2026-01-20T00:00:00Z")))).toBe("2026-01-10T00:00:00.000Z");
    expect(iso(clampDate(a, d("2026-01-07T00:00:00Z")))).toBe("2026-01-07T00:00:00.000Z");
  });
});

describe("split()", () => {
  it("splits into equal chunks", () => {
    const parts = split(iv("2026-01-01T00:00:00Z", "2026-01-04T00:00:00Z"), { every: 86_400_000 });
    expect(parts).toHaveLength(3);
    expect(iso(parts[0]!.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(parts[2]!.end)).toBe("2026-01-04T00:00:00.000Z");
  });
  it("leaves a shorter final chunk for a remainder", () => {
    const parts = split(iv("2026-01-01T00:00:00Z", "2026-01-01T02:30:00Z"), 3_600_000);
    expect(parts).toHaveLength(3);
    expect(durationMs(parts[2]!)).toBe(1_800_000);
  });
  it("throws on a non-positive step", () => {
    expect(() => split(iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"), 0)).toThrow();
  });
});

describe("mergeIntervals()", () => {
  it("coalesces overlapping and adjacent, sorting first", () => {
    const merged = mergeIntervals([
      iv("2026-01-10T00:00:00Z", "2026-01-12T00:00:00Z"),
      iv("2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z"),
      iv("2026-01-04T00:00:00Z", "2026-01-08T00:00:00Z"), // overlaps prev
      iv("2026-01-08T00:00:00Z", "2026-01-10T00:00:00Z"), // abuts on both sides
    ]);
    expect(merged).toHaveLength(1);
    expect(iso(merged[0]!.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(merged[0]!.end)).toBe("2026-01-12T00:00:00.000Z");
  });
  it("keeps disjoint intervals separate and ordered", () => {
    const merged = mergeIntervals([
      iv("2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"),
      iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
    ]);
    expect(merged).toHaveLength(2);
    expect(iso(merged[0]!.start)).toBe("2026-01-01T00:00:00.000Z");
  });
  it("returns [] for an empty list", () => {
    expect(mergeIntervals([])).toHaveLength(0);
  });
});

describe("intersectAll()", () => {
  it("returns the common overlap of all", () => {
    const r = intersectAll([
      iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"),
      iv("2026-01-03T00:00:00Z", "2026-01-08T00:00:00Z"),
      iv("2026-01-05T00:00:00Z", "2026-01-20T00:00:00Z"),
    ])!;
    expect(iso(r.start)).toBe("2026-01-05T00:00:00.000Z");
    expect(iso(r.end)).toBe("2026-01-08T00:00:00.000Z");
  });
  it("returns null when any pair is disjoint, and for empty list", () => {
    expect(
      intersectAll([
        iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
        iv("2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z"),
      ])
    ).toBeNull();
    expect(intersectAll([])).toBeNull();
  });
});

describe("invert() — free/busy", () => {
  const day = iv("2026-01-05T09:00:00Z", "2026-01-05T17:00:00Z");
  it("returns the free gaps between busy blocks inside the bounds", () => {
    const free = invert(
      [
        iv("2026-01-05T10:00:00Z", "2026-01-05T11:00:00Z"),
        iv("2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z"),
      ],
      day
    );
    expect(free).toHaveLength(3);
    expect(iso(free[0]!.start)).toBe("2026-01-05T09:00:00.000Z");
    expect(iso(free[0]!.end)).toBe("2026-01-05T10:00:00.000Z");
    expect(iso(free[1]!.start)).toBe("2026-01-05T11:00:00.000Z");
    expect(iso(free[2]!.end)).toBe("2026-01-05T17:00:00.000Z");
  });
  it("merges overlapping busy blocks and clips to the bounds", () => {
    const free = invert(
      [
        iv("2026-01-05T08:00:00Z", "2026-01-05T12:00:00Z"), // starts before bounds
        iv("2026-01-05T11:30:00Z", "2026-01-05T13:00:00Z"), // overlaps prev
      ],
      day
    );
    expect(free).toHaveLength(1);
    expect(iso(free[0]!.start)).toBe("2026-01-05T13:00:00.000Z");
    expect(iso(free[0]!.end)).toBe("2026-01-05T17:00:00.000Z");
  });
  it("returns the whole window when there is no busy time", () => {
    const free = invert([], day);
    expect(free).toHaveLength(1);
    expect(isEqual(free[0]!, day)).toBe(true);
  });
  it("returns [] when busy fully covers the window", () => {
    expect(invert([iv("2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z")], day)).toHaveLength(0);
  });
});

describe("iteration helpers", () => {
  it("eachDayOfInterval is inclusive of the end day", () => {
    const days = eachDayOfInterval(iv("2026-01-01T06:00:00Z", "2026-01-05T02:00:00Z"));
    expect(days).toHaveLength(5);
    expect(iso(days[0]!)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(days[4]!)).toBe("2026-01-05T00:00:00.000Z");
  });
  it("eachDayOfInterval yields one day for a same-day interval", () => {
    expect(eachDayOfInterval(iv("2026-01-01T01:00:00Z", "2026-01-01T23:00:00Z"))).toHaveLength(1);
  });
  it("eachHourOfInterval steps hour boundaries inclusive of end hour", () => {
    const hrs = eachHourOfInterval(iv("2026-01-01T00:15:00Z", "2026-01-01T03:00:00Z"));
    expect(hrs).toHaveLength(4);
    expect(iso(hrs[0]!)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(hrs[3]!)).toBe("2026-01-01T03:00:00.000Z");
  });
  it("eachWeekOfInterval defaults to Monday-start weeks", () => {
    // 2026-01-01 Thu … 2026-01-20 Tue → weeks starting Mon 2025-12-29, 01-05, 01-12, 01-19
    const weeks = eachWeekOfInterval(iv("2026-01-01T00:00:00Z", "2026-01-20T00:00:00Z"));
    expect(weeks).toHaveLength(4);
    expect(iso(weeks[0]!)).toBe("2025-12-29T00:00:00.000Z");
    expect(weeks[0]!.getUTCDay()).toBe(1); // Monday
  });
  it("eachWeekOfInterval honours weekStartsOn: 0 (Sunday)", () => {
    const weeks = eachWeekOfInterval(iv("2026-01-01T00:00:00Z", "2026-01-11T00:00:00Z"), { weekStartsOn: 0 });
    expect(weeks[0]!.getUTCDay()).toBe(0);
  });
  it("eachMonthOfInterval is inclusive of the end month", () => {
    const months = eachMonthOfInterval(iv("2026-01-15T00:00:00Z", "2026-04-02T00:00:00Z"));
    expect(months).toHaveLength(4);
    expect(iso(months[0]!)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(months[3]!)).toBe("2026-04-01T00:00:00.000Z");
  });
  it("eachOfInterval steps by an arbitrary ms amount, inclusive of end", () => {
    const pts = eachOfInterval(iv("2026-01-01T00:00:00Z", "2026-01-01T00:00:30Z"), { step: 10_000 });
    expect(pts).toHaveLength(4);
    expect(iso(pts[3]!)).toBe("2026-01-01T00:00:30.000Z");
  });
  it("eachOfInterval throws on non-positive step", () => {
    expect(() => eachOfInterval(iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"), { step: 0 })).toThrow();
  });
});

describe("business days", () => {
  // 2026-01-01 Thu, 02 Fri, 03 Sat, 04 Sun, 05 Mon … 09 Fri, 10 Sat, 11 Sun.
  const holidays = ["2026-01-01", "2026-01-06"]; // New Year (Thu) + a Tuesday holiday

  it("isBusinessDay flags weekends and holidays", () => {
    expect(isBusinessDay(d("2026-01-05T00:00:00Z"))).toBe(true); // Mon
    expect(isBusinessDay(d("2026-01-03T00:00:00Z"))).toBe(false); // Sat
    expect(isBusinessDay(d("2026-01-04T00:00:00Z"))).toBe(false); // Sun
    expect(isBusinessDay(d("2026-01-01T12:00:00Z"), { holidays })).toBe(false); // holiday
    expect(isBusinessDay(d("2026-01-06T00:00:00Z"), { holidays })).toBe(false); // Tue, but a configured holiday
    expect(isBusinessDay(d("2026-01-06T00:00:00Z"))).toBe(true); // Tue, no holiday cfg
  });

  it("respects a custom weekendDays config", () => {
    // Fri+Sat weekend
    expect(isBusinessDay(d("2026-01-04T00:00:00Z"), { weekendDays: [5, 6] })).toBe(true); // Sun now a workday
    expect(isBusinessDay(d("2026-01-02T00:00:00Z"), { weekendDays: [5, 6] })).toBe(false); // Fri now weekend
  });

  it("addBusinessDays skips weekends", () => {
    // Fri 2026-01-02 + 1 business day → Mon 2026-01-05
    expect(iso(addBusinessDays(d("2026-01-02T09:30:00Z"), 1))).toBe("2026-01-05T09:30:00.000Z");
  });

  it("addBusinessDays skips weekends AND holidays", () => {
    // Mon 2026-01-05 + 1, with Tue 01-06 a holiday → Wed 2026-01-07
    expect(iso(addBusinessDays(d("2026-01-05T00:00:00Z"), 1, { holidays }))).toBe("2026-01-07T00:00:00.000Z");
  });

  it("addBusinessDays preserves time-of-day and handles n=0", () => {
    const t = d("2026-01-05T13:45:00Z");
    expect(iso(addBusinessDays(t, 0))).toBe("2026-01-05T13:45:00.000Z");
  });

  it("subtractBusinessDays mirrors addBusinessDays", () => {
    // Mon 2026-01-05 - 1 business day → Fri 2026-01-02
    expect(iso(subtractBusinessDays(d("2026-01-05T00:00:00Z"), 1))).toBe("2026-01-02T00:00:00.000Z");
  });

  it("addBusinessDays goes backward for negative n", () => {
    // Mon 05 → Fri 02 → Thu 01 (a business day; no holiday cfg here)
    expect(iso(addBusinessDays(d("2026-01-05T00:00:00Z"), -2))).toBe("2026-01-01T00:00:00.000Z");
  });

  it("next/prevBusinessDay jump over the weekend", () => {
    expect(iso(nextBusinessDay(d("2026-01-02T00:00:00Z")))).toBe("2026-01-05T00:00:00.000Z"); // Fri → Mon
    expect(iso(prevBusinessDay(d("2026-01-05T00:00:00Z")))).toBe("2026-01-02T00:00:00.000Z"); // Mon → Fri
  });

  it("businessDaysBetween counts the half-open [a,b) range", () => {
    // Mon 05 → Mon 12: business days 05,06,07,08,09 = 5 (12 excluded)
    expect(businessDaysBetween(d("2026-01-05T00:00:00Z"), d("2026-01-12T00:00:00Z"))).toBe(5);
  });

  it("businessDaysBetween excludes weekends and holidays", () => {
    // Same range but 01-06 is a holiday → 4
    expect(businessDaysBetween(d("2026-01-05T00:00:00Z"), d("2026-01-12T00:00:00Z"), { holidays })).toBe(4);
  });

  it("businessDaysBetween is signed and zero for same day", () => {
    expect(businessDaysBetween(d("2026-01-12T00:00:00Z"), d("2026-01-05T00:00:00Z"))).toBe(-5);
    expect(businessDaysBetween(d("2026-01-05T00:00:00Z"), d("2026-01-05T23:00:00Z"))).toBe(0);
  });

  it("eachBusinessDayOfInterval filters weekends and holidays", () => {
    // Mon 05 … Sun 11 inclusive → business days 05,06,07,08,09 minus holiday 06 = 4
    const days = eachBusinessDayOfInterval(iv("2026-01-05T00:00:00Z", "2026-01-11T00:00:00Z"), { holidays });
    expect(days).toHaveLength(4);
    expect(iso(days[0]!)).toBe("2026-01-05T00:00:00.000Z");
    expect(days.some((x) => iso(x) === "2026-01-06T00:00:00.000Z")).toBe(false);
    expect(days.every((x) => [0, 6].includes(x.getUTCDay()) === false)).toBe(true);
  });
});

describe("isSameDay()", () => {
  it("compares UTC calendar days", () => {
    expect(isSameDay(d("2026-01-05T00:00:00Z"), d("2026-01-05T23:59:59Z"))).toBe(true);
    expect(isSameDay(d("2026-01-05T00:00:00Z"), d("2026-01-06T00:00:00Z"))).toBe(false);
  });
});
