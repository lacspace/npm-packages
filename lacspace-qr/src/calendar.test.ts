import { describe, it, expect } from "vitest";
import { calendarPayload, escapeIcs } from "./payloads.js";

describe("calendarPayload", () => {
  it("builds a VEVENT with summary and UTC start", () => {
    const s = calendarPayload({ title: "Launch", start: "2026-10-01T09:00:00Z" });
    expect(s.startsWith("BEGIN:VEVENT")).toBe(true);
    expect(s).toContain("SUMMARY:Launch");
    expect(s).toContain("DTSTART:20261001T090000Z");
    expect(s.endsWith("END:VEVENT")).toBe(true);
  });

  it("includes end, location and description when supplied", () => {
    const s = calendarPayload({
      title: "Meetup",
      start: "2026-10-01T09:00:00Z",
      end: "2026-10-01T10:30:00Z",
      location: "Kathmandu",
      description: "Bring a laptop",
    });
    expect(s).toContain("DTEND:20261001T103000Z");
    expect(s).toContain("LOCATION:Kathmandu");
    expect(s).toContain("DESCRIPTION:Bring a laptop");
  });

  it("emits VALUE=DATE for all-day events", () => {
    const s = calendarPayload({ title: "Holiday", start: "2026-12-25", allDay: true });
    expect(s).toContain("DTSTART;VALUE=DATE:20261225");
    expect(s).not.toContain("DTSTART:2026");
  });

  it("accepts a Date object", () => {
    const s = calendarPayload({ title: "X", start: new Date("2026-01-02T03:04:05Z") });
    expect(s).toContain("DTSTART:20260102T030405Z");
  });

  it("escapes reserved characters in text fields", () => {
    const s = calendarPayload({ title: "A, B; C", start: "2026-10-01T09:00:00Z" });
    expect(s).toContain("SUMMARY:A\\, B\\; C");
  });

  it("throws on an invalid start date", () => {
    expect(() => calendarPayload({ title: "X", start: "not-a-date" })).toThrow();
  });
});

describe("escapeIcs", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeIcs("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
});
