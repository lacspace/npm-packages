import { describe, it, expect } from "vitest";
import {
  Duration,
  duration,
  parseDuration,
  tryParseDuration,
  isDuration,
  maxDuration,
  minDuration,
  msPerUnit,
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MS_PER_WEEK,
} from "./index";

describe("constants", () => {
  it("exposes the fixed unit table", () => {
    expect(MS_PER_SECOND).toBe(1000);
    expect(MS_PER_MINUTE).toBe(60_000);
    expect(MS_PER_HOUR).toBe(3_600_000);
    expect(MS_PER_DAY).toBe(86_400_000);
    expect(MS_PER_WEEK).toBe(604_800_000);
  });
});

describe("parseDuration — ISO-8601", () => {
  it("parses a full date+time duration", () => {
    const d = parseDuration("P3Y6M4DT12H30M5S");
    expect(d.years).toBe(3);
    expect(d.months).toBe(6);
    expect(d.days).toBe(4);
    expect(d.hours).toBe(12);
    expect(d.minutes).toBe(30);
    expect(d.seconds).toBe(5);
  });

  it("parses time-only durations", () => {
    const d = parseDuration("PT1H30M");
    expect(d.hours).toBe(1);
    expect(d.minutes).toBe(30);
    expect(d.days).toBe(0);
  });

  it("disambiguates M as months (before T) vs minutes (after T)", () => {
    const d = parseDuration("P2MT3M");
    expect(d.months).toBe(2);
    expect(d.minutes).toBe(3);
  });

  it("parses week durations", () => {
    const d = parseDuration("P1W");
    expect(d.weeks).toBe(1);
    expect(d.days).toBe(0);
  });

  it("parses a fractional last component (PT0.5H)", () => {
    const d = parseDuration("PT0.5H");
    expect(d.hours).toBe(0.5);
  });

  it("accepts comma as the decimal separator", () => {
    const d = parseDuration("PT0,5S");
    expect(d.seconds).toBe(0.5);
  });

  it("parses a negative duration", () => {
    const d = parseDuration("-PT30M");
    expect(d.minutes).toBe(-30);
  });

  it("parses a leading + sign", () => {
    const d = parseDuration("+PT1H");
    expect(d.hours).toBe(1);
  });

  it("throws on an empty / bare P", () => {
    expect(() => parseDuration("P")).toThrow();
    expect(() => parseDuration("")).toThrow();
  });

  it("throws when T is present but has no time components", () => {
    expect(() => parseDuration("P1DT")).toThrow(/no time components/);
  });

  it("throws on garbage input", () => {
    expect(() => parseDuration("banana")).toThrow();
    expect(() => parseDuration("1H")).toThrow();
    expect(() => parseDuration("PT1X")).toThrow();
  });

  it("throws when a non-last component is fractional", () => {
    expect(() => parseDuration("P1.5Y2M")).toThrow(/last component/);
  });

  it("throws on non-string input", () => {
    // @ts-expect-error deliberate bad input
    expect(() => parseDuration(123)).toThrow(TypeError);
  });
});

describe("tryParseDuration", () => {
  it("returns a Duration for valid input", () => {
    expect(tryParseDuration("PT1H")?.hours).toBe(1);
  });
  it("returns null for invalid input", () => {
    expect(tryParseDuration("nope")).toBeNull();
  });
});

describe("duration() factory", () => {
  it("builds from parts", () => {
    const d = duration({ hours: 1, minutes: 30 });
    expect(d.hours).toBe(1);
    expect(d.minutes).toBe(30);
  });

  it("builds from a millisecond count", () => {
    const d = duration(5_400_000); // 1h30m
    expect(d.hours).toBe(1);
    expect(d.minutes).toBe(30);
  });

  it("ms and parts forms are equal", () => {
    expect(duration(5_400_000).equals(duration({ hours: 1, minutes: 30 }))).toBe(true);
  });

  it("rejects nonsense input", () => {
    // @ts-expect-error deliberate bad input
    expect(() => duration("nope")).toThrow();
  });

  it("rejects a non-finite field", () => {
    expect(() => duration({ hours: Number.NaN })).toThrow(TypeError);
    expect(() => duration({ days: Infinity })).toThrow(TypeError);
  });
});

describe("immutability", () => {
  it("does not mutate the receiver", () => {
    const a = duration({ hours: 1 });
    const b = a.add({ hours: 1 });
    expect(a.hours).toBe(1);
    expect(b.hours).toBe(2);
    expect(Object.isFrozen(a)).toBe(true);
  });
});

describe("arithmetic", () => {
  it("adds field-by-field (Duration or parts)", () => {
    const d = duration({ hours: 1, minutes: 30 }).add({ minutes: 45 });
    expect(d.hours).toBe(1);
    expect(d.minutes).toBe(75);
    expect(duration({ days: 1 }).add(duration({ days: 2 })).days).toBe(3);
  });

  it("subtracts field-by-field", () => {
    const d = duration({ hours: 2 }).subtract({ minutes: 30 });
    expect(d.hours).toBe(2);
    expect(d.minutes).toBe(-30);
    expect(d.toMillis()).toBe(1.5 * MS_PER_HOUR);
  });

  it("negates", () => {
    const d = duration({ hours: 1, minutes: -30 }).negate();
    expect(d.hours).toBe(-1);
    expect(d.minutes).toBe(30);
  });

  it("abs makes a negative duration positive", () => {
    expect(duration({ minutes: -30 }).abs().minutes).toBe(30);
    expect(duration({ minutes: 30 }).abs().minutes).toBe(30);
    expect(parseDuration("-P1Y2M").abs().toISO()).toBe("P1Y2M");
  });

  it("scales every field", () => {
    const d = duration({ hours: 1, minutes: 30 }).scale(2);
    expect(d.hours).toBe(2);
    expect(d.minutes).toBe(60);
    expect(duration({ seconds: 10 }).scale(0.5).seconds).toBe(5);
  });

  it("scale rejects non-finite factors", () => {
    expect(() => duration({ hours: 1 }).scale(Number.NaN)).toThrow();
  });
});

describe("normalize", () => {
  it("carries seconds -> minutes -> hours -> days", () => {
    const d = duration({ seconds: 90 }).normalize();
    expect(d.minutes).toBe(1);
    expect(d.seconds).toBe(30);

    const big = duration({ minutes: 150 }).normalize();
    expect(big.hours).toBe(2);
    expect(big.minutes).toBe(30);
  });

  it("carries hours into days (fixed 24h)", () => {
    const d = duration({ hours: 25 }).normalize();
    expect(d.days).toBe(1);
    expect(d.hours).toBe(1);
  });

  it("folds weeks into days", () => {
    const d = duration({ weeks: 1, days: 2 }).normalize();
    expect(d.weeks).toBe(0);
    expect(d.days).toBe(9);
  });

  it("keeps months/years separate but carries months -> years", () => {
    const d = duration({ months: 18, days: 40 }).normalize();
    expect(d.years).toBe(1);
    expect(d.months).toBe(6);
    expect(d.days).toBe(40); // days NOT collapsed into months
  });

  it("normalizes negative durations with a single sign", () => {
    const d = duration({ minutes: -90 }).normalize();
    expect(d.hours).toBe(-1);
    expect(d.minutes).toBe(-30);
  });
});

describe("toMillis / toSeconds — calendar honesty", () => {
  it("converts the fixed time part exactly", () => {
    expect(duration({ hours: 1, minutes: 30 }).toMillis()).toBe(5_400_000);
    expect(duration({ weeks: 1 }).toMillis()).toBe(MS_PER_WEEK);
    expect(duration({ hours: 1, minutes: 30 }).toSeconds()).toBe(5400);
  });

  it("THROWS on months without an explicit opt-in", () => {
    expect(() => duration({ months: 1 }).toMillis()).toThrow(/months/);
  });

  it("THROWS on years without an explicit opt-in", () => {
    expect(() => duration({ years: 1 }).toMillis()).toThrow(/years/);
  });

  it("approximates months/years only when told to", () => {
    expect(duration({ months: 1 }).toMillis({ assumeMonthDays: 30 })).toBe(30 * MS_PER_DAY);
    expect(duration({ years: 1 }).toMillis({ assumeYearDays: 365 })).toBe(365 * MS_PER_DAY);
  });

  it("derives a year from assumeMonthDays when assumeYearDays is omitted", () => {
    expect(duration({ years: 1 }).toMillis({ assumeMonthDays: 30 })).toBe(360 * MS_PER_DAY);
  });
});

describe(".as(unit)", () => {
  it("converts to fixed units", () => {
    const d = duration({ hours: 36 });
    expect(d.as("days")).toBe(1.5);
    expect(d.as("hours")).toBe(36);
    expect(d.as("minutes")).toBe(2160);
    expect(duration({ days: 14 }).as("weeks")).toBe(2);
  });

  it("requires options for calendar unit targets", () => {
    expect(() => duration({ days: 60 }).as("months")).toThrow();
    expect(duration({ days: 60 }).as("months", { assumeMonthDays: 30 })).toBe(2);
  });
});

describe("Duration.between", () => {
  it("is exact and calendar-free", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-01-02T06:00:00Z");
    const d = Duration.between(a, b);
    expect(d.toMillis()).toBe(30 * MS_PER_HOUR);
    expect(d.days).toBe(1);
    expect(d.hours).toBe(6);
  });

  it("is negative when b precedes a", () => {
    const a = new Date("2026-01-02T00:00:00Z");
    const b = new Date("2026-01-01T00:00:00Z");
    expect(Duration.between(a, b).toMillis()).toBe(-MS_PER_DAY);
  });

  it("throws on non-Date / invalid dates", () => {
    // @ts-expect-error bad input
    expect(() => Duration.between("x", new Date())).toThrow();
    expect(() => Duration.between(new Date("nope"), new Date())).toThrow();
  });
});

describe("fromMillis / zero", () => {
  it("round-trips through millis", () => {
    expect(Duration.fromMillis(90_061_000).toMillis()).toBe(90_061_000);
  });
  it("handles negatives", () => {
    const d = Duration.fromMillis(-5_400_000);
    expect(d.hours).toBe(-1);
    expect(d.minutes).toBe(-30);
  });
  it("zero is empty", () => {
    expect(Duration.zero.isZero()).toBe(true);
    expect(Duration.zero.toMillis()).toBe(0);
  });
});

describe("equals / compare", () => {
  it("equal by normalized value", () => {
    expect(parseDuration("P1W").equals(parseDuration("P7D"))).toBe(true);
    expect(parseDuration("PT60M").equals(parseDuration("PT1H"))).toBe(true);
  });

  it("is calendar-honest: a month is not 30 days", () => {
    expect(parseDuration("P1M").equals(parseDuration("P30D"))).toBe(false);
  });

  it("compares durations (-1/0/1)", () => {
    expect(duration({ hours: 1 }).compare(duration({ minutes: 30 }))).toBe(1);
    expect(duration({ minutes: 30 }).compare(duration({ hours: 1 }))).toBe(-1);
    expect(duration({ hours: 1 }).compare(duration({ minutes: 60 }))).toBe(0);
  });

  it("orders calendar units nominally for min/max", () => {
    const a = duration({ months: 1 });
    const b = duration({ days: 40 });
    // nominal month = 30d < 40d
    expect(a.compare(b)).toBe(-1);
    expect(maxDuration(a, b)).toBe(b);
    expect(minDuration(a, b)).toBe(a);
  });

  it("min/max throw on empty input", () => {
    expect(() => maxDuration()).toThrow();
    expect(() => minDuration()).toThrow();
  });
});

describe("toISO / toJSON round-trips", () => {
  it("serializes a full duration", () => {
    expect(parseDuration("P3Y6M4DT12H30M5S").toISO()).toBe("P3Y6M4DT12H30M5S");
  });

  it("round-trips a variety of strings", () => {
    for (const iso of ["PT1H30M", "P1W", "-PT30M", "PT0.5H", "P2MT3M", "P10D"]) {
      expect(parseDuration(iso).equals(parseDuration(parseDuration(iso).toISO()))).toBe(true);
    }
  });

  it("emits PT0S for zero", () => {
    expect(Duration.zero.toISO()).toBe("PT0S");
  });

  it("folds weeks into days when other components are present", () => {
    expect(duration({ weeks: 1, days: 2 }).toISO()).toBe("P9D");
  });

  it("keeps a pure-week duration as PnW", () => {
    expect(duration({ weeks: 3 }).toISO()).toBe("P3W");
  });

  it("formats fractional seconds", () => {
    expect(duration({ seconds: 1, milliseconds: 500 }).toISO()).toBe("PT1.5S");
  });

  it("prefixes negative durations with -", () => {
    expect(duration({ minutes: -30 }).toISO()).toBe("-PT30M");
  });

  it("toJSON returns the ISO string", () => {
    expect(JSON.stringify({ d: parseDuration("PT1H") })).toBe('{"d":"PT1H"}');
  });
});

describe("isDuration", () => {
  it("recognizes Durations and rejects others", () => {
    expect(isDuration(duration({ hours: 1 }))).toBe(true);
    expect(isDuration({ hours: 1 })).toBe(false);
    expect(isDuration(null)).toBe(false);
    expect(isDuration(5400000)).toBe(false);
  });
});

describe("msPerUnit", () => {
  it("returns fixed unit sizes", () => {
    expect(msPerUnit("seconds")).toBe(1000);
    expect(msPerUnit("weeks")).toBe(MS_PER_WEEK);
  });
  it("throws for calendar units without options", () => {
    expect(() => msPerUnit("months")).toThrow();
    expect(msPerUnit("months", { assumeMonthDays: 30 })).toBe(30 * MS_PER_DAY);
  });
});
