import { describe, it, expect } from "vitest";
import { nextPayoutDate } from "./index";

const key = (d: Date) => d.toISOString().slice(0, 10);

// 2026-01-01 is a Thursday (UTC).
describe("nextPayoutDate — schedule", () => {
  it("daily → the next day", () => {
    expect(key(nextPayoutDate({ kind: "daily" }, "2026-01-01"))).toBe("2026-01-02");
  });

  it("T+N counts days from `from`", () => {
    // T+2 from Thu = Sat → skip weekend → Mon 2026-01-05
    expect(key(nextPayoutDate({ kind: "tplus", days: 2 }, "2026-01-01"))).toBe("2026-01-05");
  });

  it("weekly targets the next occurrence of the weekday", () => {
    // next Friday after Thu 2026-01-01 is 2026-01-02
    expect(key(nextPayoutDate({ kind: "weekly", weekday: 5 }, "2026-01-01"))).toBe("2026-01-02");
    // next Monday after Thu 2026-01-01 is 2026-01-05
    expect(key(nextPayoutDate({ kind: "weekly", weekday: 1 }, "2026-01-01"))).toBe("2026-01-05");
  });

  it("skips weekends", () => {
    // T+1 from Fri 2026-01-02 = Sat → skip → Mon 2026-01-05
    expect(key(nextPayoutDate({ kind: "tplus", days: 1 }, "2026-01-02"))).toBe("2026-01-05");
  });

  it("skips supplied holidays (and weekends after them)", () => {
    const out = nextPayoutDate(
      { kind: "daily", holidays: ["2026-01-02"] },
      "2026-01-01",
    );
    // next day Fri 01-02 is a holiday → Sat/Sun weekend → Mon 01-05
    expect(key(out)).toBe("2026-01-05");
  });

  it("respects skipWeekends:false", () => {
    expect(
      key(nextPayoutDate({ kind: "tplus", days: 2, skipWeekends: false }, "2026-01-01")),
    ).toBe("2026-01-03");
  });
});
