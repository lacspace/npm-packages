import { describe, it, expect } from "vitest";
import { explainCron } from "./explain.js";

describe("explainCron", () => {
  it("describes an exact weekday time", () => {
    const s = explainCron("0 9 * * 1-5");
    expect(s).toContain("09:00");
    expect(s).toContain("Monday through Friday");
  });

  it("describes a minute step", () => {
    expect(explainCron("*/15 * * * *").toLowerCase()).toContain("every 15 minutes");
  });

  it("describes every minute", () => {
    expect(explainCron("* * * * *")).toBe("Every minute.");
  });

  it("describes the first of the month", () => {
    const s = explainCron("0 0 1 * *");
    expect(s).toContain("00:00");
    expect(s).toContain("1st");
  });

  it("describes @yearly with a month name", () => {
    const s = explainCron("@yearly");
    expect(s).toContain("January");
    expect(s).toContain("1st");
  });

  it("describes @hourly", () => {
    expect(explainCron("@hourly").toLowerCase()).toContain("every hour");
  });

  it("describes a list of weekdays", () => {
    const s = explainCron("0 12 * * 1,3,5");
    expect(s).toContain("Monday");
    expect(s).toContain("Wednesday");
    expect(s).toContain("Friday");
  });

  it("ends with a period and is capitalized", () => {
    const s = explainCron("0 9 * * 1-5");
    expect(s.endsWith(".")).toBe(true);
    expect(s[0]).toBe(s[0]!.toUpperCase());
  });
});
