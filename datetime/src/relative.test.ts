import { describe, it, expect } from "vitest";
import { formatRelative } from "./index.js";

describe("formatRelative", () => {
  // Pin the locale so assertions are stable regardless of the host default.
  const now = new Date(2021, 5, 15, 12, 0, 0);
  const base = { now, locale: "en" } as const;

  it("renders past distances", () => {
    expect(formatRelative(new Date(2021, 5, 15, 9, 0, 0), base)).toBe("3 hours ago");
    expect(formatRelative(new Date(2021, 5, 15, 11, 59, 0), base)).toBe("1 minute ago");
  });

  it("renders future distances", () => {
    expect(formatRelative(new Date(2021, 5, 17, 12, 0, 0), base)).toBe("in 2 days");
    expect(formatRelative(new Date(2021, 5, 15, 14, 0, 0), base)).toBe("in 2 hours");
  });

  it("uses idiomatic phrasing with numeric:auto (the default)", () => {
    expect(formatRelative(new Date(2021, 5, 14, 12, 0, 0), base)).toBe("yesterday");
    expect(formatRelative(new Date(2021, 5, 16, 12, 0, 0), base)).toBe("tomorrow");
  });

  it("forces numbers with numeric:always", () => {
    expect(formatRelative(new Date(2021, 5, 16, 12, 0, 0), { ...base, numeric: "always" })).toBe("in 1 day");
  });

  it("honours a forced unit", () => {
    expect(formatRelative(new Date(2021, 5, 15, 9, 0, 0), { ...base, unit: "minute" })).toBe("180 minutes ago");
  });

  it("picks the largest natural unit", () => {
    expect(formatRelative(new Date(2023, 5, 15, 12, 0, 0), base)).toBe("in 2 years");
    expect(formatRelative(new Date(2019, 5, 15, 12, 0, 0), base)).toBe("2 years ago");
  });

  it("returns Invalid Date for bad input", () => {
    expect(formatRelative("garbage", base)).toBe("Invalid Date");
  });
});
