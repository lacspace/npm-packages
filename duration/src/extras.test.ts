import { describe, it, expect } from "vitest";
import {
  duration,
  parseDuration,
  Duration,
  MS_PER_DAY,
  durationSign,
  isNegativeDuration,
  clampDuration,
  sumDurations,
  rebalance,
  humanizeDuration,
  toClock,
  parseClock,
} from "./index";

describe("durationSign / isNegativeDuration", () => {
  it("reads the overall sign from the first non-zero field", () => {
    expect(durationSign(duration({ hours: 1 }))).toBe(1);
    expect(durationSign(duration({ minutes: -30 }))).toBe(-1);
    expect(durationSign(Duration.zero)).toBe(0);
    // first non-zero field wins (years before the negative minutes)
    expect(durationSign(duration({ years: 1, minutes: -30 }))).toBe(1);
  });

  it("isNegativeDuration is true only for negative spans", () => {
    expect(isNegativeDuration(parseDuration("-PT30M"))).toBe(true);
    expect(isNegativeDuration(duration({ hours: 1 }))).toBe(false);
    expect(isNegativeDuration(Duration.zero)).toBe(false);
  });
});

describe("clampDuration", () => {
  const lo = duration({ minutes: 30 });
  const hi = duration({ hours: 2 });

  it("returns the value when in range", () => {
    expect(clampDuration(duration({ hours: 1 }), lo, hi).toISO()).toBe("PT1H");
  });
  it("clamps below the minimum", () => {
    expect(clampDuration(duration({ minutes: 5 }), lo, hi)).toBe(lo);
  });
  it("clamps above the maximum", () => {
    expect(clampDuration(duration({ hours: 5 }), lo, hi)).toBe(hi);
  });
  it("throws when min > max", () => {
    expect(() => clampDuration(duration({ hours: 1 }), hi, lo)).toThrow(/min/);
  });
});

describe("sumDurations", () => {
  it("adds many durations field-by-field", () => {
    const total = sumDurations(
      duration({ hours: 1 }),
      duration({ minutes: 30 }),
      duration({ minutes: 30 }),
    ).normalize();
    expect(total.toISO()).toBe("PT2H");
  });
  it("returns zero for no arguments", () => {
    expect(sumDurations().isZero()).toBe(true);
  });
});

describe("rebalance", () => {
  it("collapses fixed units to a normalized form", () => {
    expect(rebalance(duration({ minutes: 90 })).toISO()).toBe("PT1H30M");
  });
  it("throws on months/years without opt-in, honours it with", () => {
    expect(() => rebalance(duration({ months: 1 }))).toThrow(/months/);
    expect(rebalance(duration({ months: 1 }), { assumeMonthDays: 30 }).toMillis()).toBe(
      30 * MS_PER_DAY,
    );
  });
});

describe("humanizeDuration", () => {
  it("renders a compact short form by default", () => {
    expect(humanizeDuration(duration({ hours: 1, minutes: 30 }))).toBe("1h 30m");
  });
  it("renders a long form", () => {
    expect(humanizeDuration(duration({ hours: 1, minutes: 30 }), { short: false })).toBe(
      "1 hour 30 minutes",
    );
  });
  it("pluralizes long units correctly", () => {
    expect(humanizeDuration(duration({ days: 1 }), { short: false })).toBe("1 day");
    expect(humanizeDuration(duration({ days: 2 }), { short: false })).toBe("2 days");
  });
  it("is calendar-safe: shows months/years as fields", () => {
    expect(humanizeDuration(parseDuration("P1Y6M"))).toBe("1y 6mo");
  });
  it("can normalize before formatting", () => {
    expect(humanizeDuration(duration({ minutes: 90 }), { normalize: true })).toBe("1h 30m");
  });
  it("respects largest and conjunction", () => {
    const d = duration({ hours: 1, minutes: 30, seconds: 15 });
    expect(humanizeDuration(d, { largest: 2 })).toBe("1h 30m");
    expect(humanizeDuration(d, { short: false, conjunction: " and ", largest: 2 })).toBe(
      "1 hour and 30 minutes",
    );
  });
  it("handles negatives and zero", () => {
    expect(humanizeDuration(parseDuration("-PT30M"))).toBe("-30m");
    expect(humanizeDuration(Duration.zero)).toBe("0s");
    expect(humanizeDuration(Duration.zero, { short: false, zero: "none" })).toBe("none");
  });
  it("filters to explicit units", () => {
    expect(humanizeDuration(duration({ hours: 1, minutes: 30 }), { units: ["hours"] })).toBe("1h");
  });
});

describe("toClock", () => {
  it("formats HH:MM:SS", () => {
    expect(toClock(duration({ hours: 1, minutes: 30 }))).toBe("01:30:00");
  });
  it("lets hours exceed 24 by default", () => {
    expect(toClock(duration({ hours: 36 }))).toBe("36:00:00");
  });
  it("can split out a day segment", () => {
    expect(toClock(duration({ days: 1, hours: 12 }), { showDays: true })).toBe("01:12:00:00");
  });
  it("adds fractional seconds", () => {
    expect(toClock(duration({ seconds: 1, milliseconds: 500 }), { fractionalDigits: 3 })).toBe(
      "00:00:01.500",
    );
  });
  it("prefixes negatives", () => {
    expect(toClock(duration({ minutes: -30 }))).toBe("-00:30:00");
  });
  it("throws on months/years", () => {
    expect(() => toClock(duration({ months: 1 }))).toThrow(/months/);
  });
});

describe("parseClock", () => {
  it("parses HH:MM:SS", () => {
    expect(parseClock("01:30:00").toISO()).toBe("PT1H30M");
  });
  it("parses MM:SS and bare SS", () => {
    expect(parseClock("30:00").toISO()).toBe("PT30M");
    expect(parseClock("45").toISO()).toBe("PT45S");
  });
  it("parses a day segment", () => {
    expect(parseClock("01:12:00:00").toISO()).toBe("P1DT12H");
  });
  it("parses fractional seconds and sign", () => {
    expect(parseClock("00:00:01.5").toISO()).toBe("PT1.5S");
    expect(parseClock("-00:00:30").toISO()).toBe("-PT30S");
  });
  it("round-trips with toClock", () => {
    for (const clock of ["01:30:00", "36:00:00", "00:00:45"]) {
      expect(toClock(parseClock(clock))).toBe(clock);
    }
  });
  it("throws on malformed input", () => {
    expect(() => parseClock("1:2:3:4:5")).toThrow();
    expect(() => parseClock("aa:bb")).toThrow();
  });
});
