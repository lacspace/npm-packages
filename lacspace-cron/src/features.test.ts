import { describe, it, expect } from "vitest";
import {
  parseCron, parseSchedule, parseDuration,
  nextRuns, prevRuns, runsBetween, countBetween, overlaps,
  describeRelative, toICS, explainCron, matchesCron, dstWarnings,
} from "./lib.js";

const iso = (d: Date): string => d.toISOString();
const at = (s: string): Date => new Date(s);
const UTC = { tz: "UTC" } as const;

/* ---- 1. Advanced day tokens: L / L-n / LW / nW / dL / d#n ---------------- */
describe("advanced day tokens — matching", () => {
  it("L / L-3 hit the last (and 3rd-from-last) day of the month", () => {
    expect(iso(nextRuns("0 0 L * *", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-31T00:00:00.000Z");
    expect(iso(nextRuns("0 0 L-3 * *", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-28T00:00:00.000Z");
  });

  it("LW picks the last weekday of the month (Jan 2021 ends on a Sunday → Fri 29th)", () => {
    expect(iso(nextRuns("0 0 LW * *", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-29T00:00:00.000Z");
  });

  it("15W is the 15th when a weekday, else shifts to the nearest weekday (May 2021 → Fri 14th)", () => {
    // Jan 15 2021 is a Friday → the 15th itself.
    expect(iso(nextRuns("0 0 15W * *", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-15T00:00:00.000Z");
    // May 15 2021 is a Saturday → shift back to Friday the 14th.
    expect(iso(nextRuns("0 0 15W * *", { from: at("2021-05-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-05-14T00:00:00.000Z");
  });

  it("5L = last Friday, 5#2 = 2nd Friday (Jan 2021)", () => {
    expect(iso(nextRuns("0 0 * * 5L", { from: at("2021-01-02T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-29T00:00:00.000Z");
    expect(iso(nextRuns("0 0 * * 5#2", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-08T00:00:00.000Z");
    // FRI#3 by name works too → 3rd Friday = Jan 15.
    expect(iso(nextRuns("0 0 * * FRI#3", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 })[0]!))
      .toBe("2021-01-15T00:00:00.000Z");
  });

  it("matchesCron agrees on the special-day instants", () => {
    expect(matchesCron("0 0 L * *", at("2021-01-31T00:00:00Z"), "UTC")).toBe(true);
    expect(matchesCron("0 0 * * 5#2", at("2021-01-08T00:00:00Z"), "UTC")).toBe(true);
    expect(matchesCron("0 0 * * 5#2", at("2021-01-15T00:00:00Z"), "UTC")).toBe(false);
  });
});

/* ---- 2. Jenkins-style H ------------------------------------------------- */
describe("Jenkins-style H tokens", () => {
  it("resolves H deterministically and within range, differing by seed", () => {
    const a1 = parseCron("H * * * *", { seed: "job-a" }).minute;
    const a2 = parseCron("H * * * *", { seed: "job-a" }).minute;
    expect(a1).toEqual(a2);                    // stable
    expect(a1).toHaveLength(1);
    expect(a1[0]!).toBeGreaterThanOrEqual(0);
    expect(a1[0]!).toBeLessThanOrEqual(59);
    const b = parseCron("H * * * *", { seed: "job-b" }).minute;
    expect(b).not.toEqual(a1);                 // seed changes the value
  });

  it("H/15 spreads into 4 stable values 15 apart; H(0-6) stays in sub-range", () => {
    const m = parseCron("H/15 * * * *", { seed: "x" }).minute;
    expect(m).toHaveLength(4);
    expect(m[1]! - m[0]!).toBe(15);
    expect(m[3]! - m[2]!).toBe(15);
    const h = parseCron("0 H(0-6) * * *", { seed: "x" }).hour;
    expect(h).toHaveLength(1);
    expect(h[0]!).toBeGreaterThanOrEqual(0);
    expect(h[0]!).toBeLessThanOrEqual(6);
    // default seed = the expression → also deterministic run-to-run
    const r1 = nextRuns("H H * * *", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 });
    const r2 = nextRuns("H H * * *", { from: at("2021-01-01T00:00:00Z"), ...UTC, count: 1 });
    expect(iso(r1[0]!)).toBe(iso(r2[0]!));
  });
});

/* ---- 3. @every <dur> ---------------------------------------------------- */
describe("@every interval schedules", () => {
  it("parses durations and computes interval runs", () => {
    expect(parseDuration("2h30m")).toBe(9_000_000);
    expect(parseDuration("90s")).toBe(90_000);
    const runs = nextRuns("@every 90s", { from: at("2021-01-01T00:00:00Z"), count: 3 });
    expect(runs.map(iso)).toEqual([
      "2021-01-01T00:01:30.000Z",
      "2021-01-01T00:03:00.000Z",
      "2021-01-01T00:04:30.000Z",
    ]);
  });

  it("explains and discriminates the schedule kind", () => {
    expect(explainCron("@every 2h30m")).toBe("Every 2 hours and 30 minutes.");
    expect(parseSchedule("@every 5m").kind).toBe("every");
    expect(parseSchedule("0 9 * * *").kind).toBe("cron");
  });
});

/* ---- 4. prevRuns / runsBetween / countBetween --------------------------- */
describe("previous runs and windows", () => {
  it("prevRuns walks backward, most-recent first", () => {
    const p = prevRuns("0 9 * * 1-5", { from: at("2021-01-05T00:00:00Z"), ...UTC, count: 1 });
    expect(iso(p[0]!)).toBe("2021-01-04T09:00:00.000Z"); // Monday 09:00
    const two = prevRuns("0 9 * * 1-5", { from: at("2021-01-06T00:00:00Z"), ...UTC, count: 2 });
    expect(two.map(iso)).toEqual([
      "2021-01-05T09:00:00.000Z",
      "2021-01-04T09:00:00.000Z",
    ]);
  });

  it("runsBetween / countBetween list every run in a window", () => {
    const runs = runsBetween("0 0 * * *", at("2021-01-01T00:00:00Z"), at("2021-01-03T00:00:00Z"), UTC);
    expect(runs.map(iso)).toEqual([
      "2021-01-01T00:00:00.000Z",
      "2021-01-02T00:00:00.000Z",
      "2021-01-03T00:00:00.000Z",
    ]);
    expect(countBetween("0 0 * * *", at("2021-01-01T00:00:00Z"), at("2021-01-31T00:00:00Z"), UTC))
      .toBe(31);
  });
});

/* ---- 5. relative time --------------------------------------------------- */
describe("describeRelative", () => {
  it("phrases future and past offsets", () => {
    const base = at("2021-01-01T00:00:00Z");
    expect(describeRelative(at("2021-01-01T03:00:00Z"), base)).toBe("in 3 hours");
    expect(describeRelative(at("2021-01-03T00:00:00Z"), base)).toBe("in 2 days");
    expect(describeRelative(at("2020-12-31T21:00:00Z"), base)).toBe("3 hours ago");
  });
});

/* ---- 6. .ics export ----------------------------------------------------- */
describe("toICS", () => {
  it("emits a valid VCALENDAR with one VEVENT per run", () => {
    const ics = toICS("0 9 * * 1-5", { from: at("2021-01-04T00:00:00Z"), tz: "UTC", count: 2 });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20210104T090000Z"); // Mon Jan 4, 09:00Z
    expect(ics.includes("\r\n")).toBe(true);            // CRLF line endings
  });

  it("carries the plain-English summary and stable UIDs", () => {
    const ics = toICS("0 0 1 * *", { from: at("2021-01-15T00:00:00Z"), tz: "UTC", count: 1 });
    expect(ics).toContain("SUMMARY:");
    expect(ics).toMatch(/UID:[0-9a-f]{8}-0@lacspace-cron/);
  });
});

/* ---- 7. overlap / compare ---------------------------------------------- */
describe("overlaps", () => {
  it("finds the next common run of two expressions", () => {
    const r = overlaps("0 * * * *", "*/30 * * * *", { from: at("2021-01-01T00:00:05Z"), tz: "UTC" });
    expect(r.overlaps).toBe(true);
    expect(iso(r.next!)).toBe("2021-01-01T01:00:00.000Z");
  });

  it("reports no overlap when two schedules never coincide", () => {
    const r = overlaps("0 0 * * 1", "0 0 * * 2", { from: at("2021-01-01T00:00:00Z"), tz: "UTC", withinDays: 30 });
    expect(r.overlaps).toBe(false);
    expect(r.next).toBeNull();
  });
});

/* ---- 8. DST safety ------------------------------------------------------ */
describe("dstWarnings", () => {
  it("flags a run skipped by spring-forward (NY 2021-03-14, 02:30)", () => {
    const w = dstWarnings("30 2 * * *", { from: at("2021-03-01T00:00:00Z"), tz: "America/New_York", days: 20 });
    expect(w).toContainEqual({ kind: "skipped", local: "2021-03-14 02:30" });
  });

  it("flags a run repeated by fall-back (NY 2021-11-07, 01:30)", () => {
    const w = dstWarnings("30 1 * * *", { from: at("2021-11-01T00:00:00Z"), tz: "America/New_York", days: 20 });
    expect(w).toContainEqual({ kind: "repeated", local: "2021-11-07 01:30" });
  });

  it("is quiet for safe times and DST-free zones", () => {
    expect(dstWarnings("0 12 * * *", { from: at("2021-01-01T00:00:00Z"), tz: "America/New_York", days: 365 }))
      .toEqual([]);
    expect(dstWarnings("30 2 * * *", { from: at("2021-01-01T00:00:00Z"), tz: "UTC", days: 365 }))
      .toEqual([]);
    expect(dstWarnings("@every 30m", { tz: "America/New_York" })).toEqual([]);
  });
});
