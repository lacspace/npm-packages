import { describe, it, expect } from "vitest";
import { interval } from "./index";
import { containsInterval, overlapMs, isEmpty, midpoint, shift, expand } from "./algebra";

const d = (s: string) => new Date(s);
const iv = (a: string, b: string) => interval(d(a), d(b));
const iso = (x: Date) => x.toISOString();

describe("containsInterval()", () => {
  const outer = iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z");
  it("is true when inner sits fully inside (or on the edge of) outer", () => {
    expect(containsInterval(outer, iv("2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"))).toBe(true);
    expect(containsInterval(outer, iv("2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"))).toBe(true);
    expect(containsInterval(outer, iv("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"))).toBe(true);
  });
  it("is false when inner pokes outside either end", () => {
    expect(containsInterval(outer, iv("2025-12-31T00:00:00Z", "2026-01-04T00:00:00Z"))).toBe(false);
    expect(containsInterval(outer, iv("2026-01-08T00:00:00Z", "2026-01-11T00:00:00Z"))).toBe(false);
  });
});

describe("overlapMs()", () => {
  it("measures the overlapping milliseconds", () => {
    expect(
      overlapMs(iv("2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z"), iv("2026-01-01T01:00:00Z", "2026-01-01T05:00:00Z"))
    ).toBe(3_600_000);
  });
  it("is 0 for disjoint and for merely-touching intervals", () => {
    expect(overlapMs(iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"), iv("2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z"))).toBe(0);
    expect(overlapMs(iv("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"), iv("2026-01-02T00:00:00Z", "2026-01-03T00:00:00Z"))).toBe(0);
  });
});

describe("isEmpty()", () => {
  it("detects zero-length intervals", () => {
    expect(isEmpty(iv("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"))).toBe(true);
    expect(isEmpty(iv("2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z"))).toBe(false);
  });
});

describe("midpoint()", () => {
  it("returns the centre instant", () => {
    expect(iso(midpoint(iv("2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z")))).toBe("2026-01-01T01:00:00.000Z");
  });
});

describe("shift()", () => {
  it("translates both endpoints and does not alias the input", () => {
    const a = iv("2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z");
    const r = shift(a, 3_600_000);
    expect(iso(r.start)).toBe("2026-01-01T01:00:00.000Z");
    expect(iso(r.end)).toBe("2026-01-01T02:00:00.000Z");
    expect(iso(a.start)).toBe("2026-01-01T00:00:00.000Z"); // original untouched
  });
  it("moves earlier for a negative offset", () => {
    const r = shift(iv("2026-01-01T01:00:00Z", "2026-01-01T02:00:00Z"), -3_600_000);
    expect(iso(r.start)).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("expand()", () => {
  it("grows both ends by ms", () => {
    const r = expand(iv("2026-01-01T01:00:00Z", "2026-01-01T02:00:00Z"), 3_600_000);
    expect(iso(r.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(r.end)).toBe("2026-01-01T03:00:00.000Z");
  });
  it("shrinks with a negative ms and collapses to the centre when over-shrunk", () => {
    const shrunk = expand(iv("2026-01-01T00:00:00Z", "2026-01-01T04:00:00Z"), -3_600_000);
    expect(iso(shrunk.start)).toBe("2026-01-01T01:00:00.000Z");
    expect(iso(shrunk.end)).toBe("2026-01-01T03:00:00.000Z");
    const collapsed = expand(iv("2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z"), -3_600_000);
    expect(collapsed.start.getTime()).toBe(collapsed.end.getTime());
    expect(iso(collapsed.start)).toBe("2026-01-01T01:00:00.000Z");
  });
});
