import { describe, it, expect } from "vitest";
import { interval, isEqual, durationMs } from "./index";
import { sortIntervals, totalDuration, coverage, gaps, differenceAll, maxConcurrency } from "./aggregate";

const d = (s: string) => new Date(s);
const iv = (a: string, b: string) => interval(d(a), d(b));
const iso = (x: Date) => x.toISOString();
const HOUR = 3_600_000;

describe("sortIntervals()", () => {
  it("sorts by start then end and copies defensively", () => {
    const input = [
      iv("2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z"),
      iv("2026-01-01T00:00:00Z", "2026-01-09T00:00:00Z"),
      iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
    ];
    const sorted = sortIntervals(input);
    expect(iso(sorted[0]!.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(sorted[0]!.end)).toBe("2026-01-02T00:00:00.000Z"); // earlier end first
    expect(iso(sorted[2]!.start)).toBe("2026-01-05T00:00:00.000Z");
    sorted[0]!.start.setUTCFullYear(2000);
    expect(iso(input[2]!.start)).toBe("2026-01-01T00:00:00.000Z"); // input untouched
  });
});

describe("totalDuration()", () => {
  it("counts overlapping time once", () => {
    const total = totalDuration([
      iv("2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z"),
      iv("2026-01-01T01:00:00Z", "2026-01-01T03:00:00Z"), // overlaps 1h
    ]);
    expect(total).toBe(3 * HOUR);
  });
  it("is 0 for an empty list", () => {
    expect(totalDuration([])).toBe(0);
  });
});

describe("coverage()", () => {
  const day = iv("2026-01-05T09:00:00Z", "2026-01-05T17:00:00Z"); // 8h window
  it("returns the covered fraction, overlaps once, clipped to the window", () => {
    const c = coverage(
      [
        iv("2026-01-05T08:00:00Z", "2026-01-05T11:00:00Z"), // 2h inside (08–09 clipped)
        iv("2026-01-05T13:00:00Z", "2026-01-05T15:00:00Z"), // 2h inside
      ],
      day
    );
    expect(c).toBeCloseTo(4 / 8, 10);
  });
  it("is 0 for no coverage and for a zero-length window", () => {
    expect(coverage([], day)).toBe(0);
    expect(coverage([day], iv("2026-01-05T10:00:00Z", "2026-01-05T10:00:00Z"))).toBe(0);
  });
});

describe("gaps()", () => {
  it("returns the empty spaces between merged blocks (no outer bound)", () => {
    const g = gaps([
      iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
      iv("2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z"),
      iv("2026-01-05T12:00:00Z", "2026-01-07T00:00:00Z"), // overlaps prev → merged
    ]);
    expect(g).toHaveLength(1);
    expect(iso(g[0]!.start)).toBe("2026-01-02T00:00:00.000Z");
    expect(iso(g[0]!.end)).toBe("2026-01-05T00:00:00.000Z");
  });
  it("returns [] for a single block or empty list", () => {
    expect(gaps([iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")])).toHaveLength(0);
    expect(gaps([])).toHaveLength(0);
  });
});

describe("differenceAll()", () => {
  const a = iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z");
  it("subtracts many intervals, leaving the uncovered parts", () => {
    const r = differenceAll(a, [
      iv("2026-01-02T00:00:00Z", "2026-01-03T00:00:00Z"),
      iv("2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z"),
    ]);
    expect(r).toHaveLength(3);
    expect(iso(r[0]!.end)).toBe("2026-01-02T00:00:00.000Z");
    expect(iso(r[1]!.start)).toBe("2026-01-03T00:00:00.000Z");
    expect(iso(r[2]!.start)).toBe("2026-01-06T00:00:00.000Z");
    expect(iso(r[2]!.end)).toBe("2026-01-10T00:00:00.000Z");
  });
  it("returns whole a when nothing overlaps, and [] when fully covered", () => {
    expect(isEqual(differenceAll(a, [iv("2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z")])[0]!, a)).toBe(true);
    expect(differenceAll(a, [iv("2025-12-01T00:00:00Z", "2026-03-01T00:00:00Z")])).toHaveLength(0);
  });
});

describe("maxConcurrency()", () => {
  it("finds the peak number of simultaneous intervals", () => {
    const peak = maxConcurrency([
      iv("2026-01-05T09:00:00Z", "2026-01-05T11:00:00Z"),
      iv("2026-01-05T10:00:00Z", "2026-01-05T12:00:00Z"),
      iv("2026-01-05T10:30:00Z", "2026-01-05T10:45:00Z"), // 3 overlap around 10:30
    ]);
    expect(peak).toBe(3);
  });
  it("treats back-to-back (touching) intervals as non-simultaneous", () => {
    expect(
      maxConcurrency([
        iv("2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
        iv("2026-01-05T10:00:00Z", "2026-01-05T11:00:00Z"),
      ])
    ).toBe(1);
  });
  it("is 0 for an empty list and ignores zero-length intervals", () => {
    expect(maxConcurrency([])).toBe(0);
    expect(maxConcurrency([iv("2026-01-05T09:00:00Z", "2026-01-05T09:00:00Z")])).toBe(0);
  });
  it("sanity: total of a merged pair equals the union duration", () => {
    // guards against double counting alongside totalDuration
    const overlap = [iv("2026-01-05T09:00:00Z", "2026-01-05T11:00:00Z"), iv("2026-01-05T10:00:00Z", "2026-01-05T12:00:00Z")];
    expect(totalDuration(overlap)).toBe(durationMs(iv("2026-01-05T09:00:00Z", "2026-01-05T12:00:00Z")));
  });
});
