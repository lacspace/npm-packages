import { describe, it, expect } from "vitest";
import { nextRuns, matchesCron } from "./schedule.js";
import { CronError } from "./parse.js";

const iso = (d: Date): string => d.toISOString();

describe("nextRuns (UTC)", () => {
  it("skips the weekend to the following Monday 09:00", () => {
    // 2021-01-02 is a Saturday.
    const runs = nextRuns("0 9 * * 1-5", {
      from: new Date("2021-01-02T00:00:00Z"),
      tz: "UTC",
      count: 1,
    });
    expect(iso(runs[0]!)).toBe("2021-01-04T09:00:00.000Z"); // Monday
  });

  it("yields 4 runs 15 minutes apart", () => {
    const runs = nextRuns("*/15 * * * *", {
      from: new Date("2021-01-01T00:00:00Z"),
      tz: "UTC",
      count: 4,
    });
    expect(runs.map(iso)).toEqual([
      "2021-01-01T00:15:00.000Z",
      "2021-01-01T00:30:00.000Z",
      "2021-01-01T00:45:00.000Z",
      "2021-01-01T01:00:00.000Z",
    ]);
  });

  it("jumps to the first of next month at midnight", () => {
    const runs = nextRuns("0 0 1 * *", {
      from: new Date("2021-01-15T12:00:00Z"),
      tz: "UTC",
      count: 1,
    });
    expect(iso(runs[0]!)).toBe("2021-02-01T00:00:00.000Z");
  });

  it("throws when the schedule is impossible", () => {
    // Feb never has a 30th.
    expect(() =>
      nextRuns("0 0 30 2 *", { from: new Date("2021-01-01T00:00:00Z"), tz: "UTC", count: 1 }),
    ).toThrow(CronError);
  });
});

describe("nextRuns (timezone)", () => {
  it("computes 09:00 in Asia/Kathmandu (UTC+5:45)", () => {
    const runs = nextRuns("0 9 * * *", {
      from: new Date("2021-01-01T00:00:00Z"),
      tz: "Asia/Kathmandu",
      count: 1,
    });
    // 09:00 Kathmandu = 03:15 UTC.
    expect(iso(runs[0]!)).toBe("2021-01-01T03:15:00.000Z");
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(runs[0]!);
    expect(local).toBe("09:00");
  });
});

describe("matchesCron", () => {
  it("matches and rejects by weekday", () => {
    expect(matchesCron("0 9 * * 1-5", new Date("2021-01-04T09:00:00Z"), "UTC")).toBe(true); // Mon
    expect(matchesCron("0 9 * * 1-5", new Date("2021-01-02T09:00:00Z"), "UTC")).toBe(false); // Sat
    expect(matchesCron("0 9 * * 1-5", new Date("2021-01-04T09:01:00Z"), "UTC")).toBe(false); // wrong minute
  });

  it("applies the dom+dow OR-rule when both are restricted", () => {
    // 13th OR Friday.
    expect(matchesCron("0 0 13 * 5", new Date("2021-01-13T00:00:00Z"), "UTC")).toBe(true); // 13th (a Wed)
    expect(matchesCron("0 0 13 * 5", new Date("2021-01-01T00:00:00Z"), "UTC")).toBe(true); // Friday, 1st
    expect(matchesCron("0 0 13 * 5", new Date("2021-01-14T00:00:00Z"), "UTC")).toBe(false); // neither
  });
});
