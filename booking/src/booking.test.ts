import { describe, expect, it } from "vitest";
import { escapeText, foldLine, freeSlots, fromLocal, invite, mergeIntervals, offsetMinutes, proposeText, resolveLocale, zoneLabel } from "./index";
import type { FreeSlotsInput } from "./index";

const NEPAL_WEEK = [0, 1, 2, 3, 4, 5]; // Sun–Fri
const MON_FRI = [1, 2, 3, 4, 5];

function base(over: Partial<FreeSlotsInput> = {}): FreeSlotsInput {
  return {
    busy: [],
    from: "2026-10-13T00:00:00Z", // Tuesday
    to: "2026-10-13T23:59:00Z",
    durationMinutes: 30,
    hours: { start: "09:00", end: "17:00", days: MON_FRI },
    timezone: "UTC",
    now: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("time zone math", () => {
  it("Kathmandu is +05:45", () => {
    expect(offsetMinutes(Date.parse("2026-10-13T00:00:00Z"), "Asia/Kathmandu")).toBe(345);
  });
  it("New York switches EDT→EST", () => {
    expect(offsetMinutes(Date.parse("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(offsetMinutes(Date.parse("2026-12-01T12:00:00Z"), "America/New_York")).toBe(-300);
  });
  it("fromLocal handles Kathmandu", () => {
    expect(new Date(fromLocal(2026, 10, 13, 9, 0, "Asia/Kathmandu")).toISOString()).toBe("2026-10-13T03:15:00.000Z");
  });
  it("fromLocal moves skipped DST times past the gap", () => {
    // 2026-03-08 02:30 does not exist in New York.
    expect(new Date(fromLocal(2026, 3, 8, 2, 30, "America/New_York")).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
  it("fromLocal picks the earlier of repeated times", () => {
    // 2026-11-01 01:30 happens twice in New York; first is EDT (05:30Z).
    expect(new Date(fromLocal(2026, 11, 1, 1, 30, "America/New_York")).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("freeSlots", () => {
  it("fills working hours with back-to-back slots", () => {
    const s = freeSlots(base());
    expect(s).toHaveLength(16);
    expect(s[0]).toEqual({ start: "2026-10-13T09:00:00.000Z", end: "2026-10-13T09:30:00.000Z" });
    expect(s[15]!.end).toBe("2026-10-13T17:00:00.000Z");
  });

  it("works in Asia/Kathmandu (+05:45)", () => {
    const s = freeSlots(base({ timezone: "Asia/Kathmandu", durationMinutes: 60, hours: { start: "10:00", end: "12:00", days: NEPAL_WEEK } }));
    expect(s.map((x) => x.start)).toEqual(["2026-10-13T04:15:00.000Z", "2026-10-13T05:15:00.000Z"]);
  });

  it("Nepal week: Sunday works, Saturday doesn't", () => {
    const s = freeSlots(
      base({
        timezone: "Asia/Kathmandu",
        from: "2026-10-09T18:15:00Z", // Sat 10 Oct 00:00 NPT
        to: "2026-10-11T18:14:00Z", // end of Sun 11 Oct NPT
        durationMinutes: 60,
        hours: { start: "10:00", end: "11:00", days: NEPAL_WEEK },
      }),
    );
    expect(s).toEqual([{ start: "2026-10-11T04:15:00.000Z", end: "2026-10-11T05:15:00.000Z" }]);
  });

  it("Mon–Fri week skips the weekend", () => {
    const s = freeSlots(base({ from: "2026-10-10T00:00:00Z", to: "2026-10-12T23:00:00Z", durationMinutes: 480 }));
    expect(s.map((x) => x.start)).toEqual(["2026-10-12T09:00:00.000Z"]);
  });

  it("is DST-correct across the US fall-back", () => {
    const s = freeSlots(
      base({
        timezone: "America/New_York",
        from: "2026-10-30T00:00:00Z",
        to: "2026-11-03T00:00:00Z",
        durationMinutes: 60,
        hours: { start: "09:00", end: "10:00", days: MON_FRI },
      }),
    );
    expect(s.map((x) => x.start)).toEqual(["2026-10-30T13:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  });

  it("is DST-correct across the EU spring-forward", () => {
    const s = freeSlots(
      base({
        timezone: "Europe/Berlin",
        from: "2026-03-27T00:00:00Z",
        to: "2026-03-31T00:00:00Z",
        now: "2026-03-01T00:00:00Z",
        durationMinutes: 60,
        hours: { start: "09:00", end: "10:00", days: MON_FRI },
      }),
    );
    expect(s.map((x) => x.start)).toEqual(["2026-03-27T08:00:00.000Z", "2026-03-30T07:00:00.000Z"]);
  });

  it("removes slots overlapping busy time", () => {
    const s = freeSlots(base({ busy: [{ start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" }], hours: { start: "09:00", end: "12:00", days: MON_FRI } }));
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["09:00", "09:30", "11:00", "11:30"]);
  });

  it("merges overlapping busy intervals", () => {
    const s = freeSlots(
      base({
        busy: [
          { start: "2026-10-13T09:30:00Z", end: "2026-10-13T10:15:00Z" },
          { start: "2026-10-13T10:00:00Z", end: "2026-10-13T10:45:00Z" },
        ],
        hours: { start: "09:00", end: "12:00", days: MON_FRI },
      }),
    );
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["09:00", "11:00", "11:30"]);
  });

  it("mergeIntervals merges adjacent and drops empty", () => {
    expect(mergeIntervals([[5, 6], [1, 3], [3, 4], [7, 7]])).toEqual([[1, 4], [5, 6]]);
  });

  it("applies buffer around busy times", () => {
    const s = freeSlots(
      base({ busy: [{ start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" }], buffer: 15, hours: { start: "09:00", end: "12:00", days: MON_FRI } }),
    );
    // busy becomes 09:45–11:15, so 09:30 and 11:00 are gone too
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["09:00", "11:30"]);
  });

  it("buffer with a 15-minute step finds the gaps", () => {
    const s = freeSlots(
      base({
        busy: [{ start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" }],
        buffer: 15,
        stepMinutes: 15,
        hours: { start: "09:00", end: "12:00", days: MON_FRI },
      }),
    );
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["09:00", "09:15", "11:15", "11:30"]);
  });

  it("stepMinutes produces overlapping candidates", () => {
    const s = freeSlots(base({ durationMinutes: 60, stepMinutes: 30, hours: { start: "09:00", end: "11:00", days: MON_FRI } }));
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("respects minimum notice", () => {
    const s = freeSlots(base({ now: "2026-10-13T09:10:00Z", minNoticeMinutes: 120, hours: { start: "09:00", end: "12:00", days: MON_FRI } }));
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["11:30"]);
  });

  it("never returns past slots", () => {
    const s = freeSlots(base({ now: "2026-10-13T16:00:00Z" }));
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["16:00", "16:30"]);
  });

  it("skips holidays (local dates)", () => {
    const s = freeSlots(
      base({
        timezone: "Asia/Kathmandu",
        from: "2026-10-12T00:00:00Z",
        to: "2026-10-14T18:00:00Z",
        durationMinutes: 60,
        hours: { start: "10:00", end: "11:00", days: NEPAL_WEEK },
        holidays: ["2026-10-13"],
      }),
    );
    expect(s.map((x) => x.start)).toEqual(["2026-10-12T04:15:00.000Z", "2026-10-14T04:15:00.000Z"]);
  });

  it("clips to the from/to window", () => {
    const s = freeSlots(base({ from: "2026-10-13T10:00:00Z", to: "2026-10-13T11:00:00Z" }));
    expect(s.map((x) => x.start.slice(11, 16))).toEqual(["10:00", "10:30"]);
  });

  it("supports 24:00 as end of day", () => {
    const s = freeSlots(base({ to: "2026-10-14T06:00:00Z", durationMinutes: 60, hours: { start: "22:00", end: "24:00", days: [2] } }));
    expect(s.map((x) => x.end)).toEqual(["2026-10-13T23:00:00.000Z", "2026-10-14T00:00:00.000Z"]);
  });

  it("limit caps the result", () => {
    expect(freeSlots(base({ limit: 2 }))).toHaveLength(2);
  });

  it("ignores invalid busy entries", () => {
    const s = freeSlots(base({ busy: [{ start: "nope", end: "x" }, null as never], hours: { start: "09:00", end: "10:00", days: MON_FRI } }));
    expect(s).toHaveLength(2);
  });

  it("returns [] for invalid input instead of throwing", () => {
    expect(freeSlots(base({ timezone: "Mars/Olympus" }))).toEqual([]);
    expect(freeSlots(base({ durationMinutes: 0 }))).toEqual([]);
    expect(freeSlots(base({ from: "bad" }))).toEqual([]);
    expect(freeSlots(base({ to: "2026-10-12T00:00:00Z" }))).toEqual([]);
    expect(freeSlots(base({ hours: { start: "17:00", end: "09:00", days: MON_FRI } }))).toEqual([]);
    expect(freeSlots(base({ hours: { start: "9am", end: "5pm", days: MON_FRI } }))).toEqual([]);
    expect(freeSlots(undefined as never)).toEqual([]);
  });
});

describe("proposeText", () => {
  const slots = [
    { start: "2026-10-13T04:15:00Z", end: "2026-10-13T04:45:00Z" },
    { start: "2026-10-14T08:15:00Z", end: "2026-10-14T08:45:00Z" },
    { start: "2026-10-15T03:15:00Z", end: "2026-10-15T03:45:00Z" },
    { start: "2026-10-16T03:15:00Z", end: "2026-10-16T03:45:00Z" },
  ];

  it("formats a list in NPT", () => {
    expect(proposeText(slots, { timezone: "Asia/Kathmandu" })).toBe(
      "Tue 13 Oct, 10:00–10:30 (NPT)\nWed 14 Oct, 14:00–14:30 (NPT)\nThu 15 Oct, 09:00–09:30 (NPT)",
    );
  });

  it("respects limit", () => {
    expect(proposeText(slots, { timezone: "Asia/Kathmandu", limit: 1 })).toBe("Tue 13 Oct, 10:00–10:30 (NPT)");
  });

  it("sentence style", () => {
    const s = proposeText(slots, { timezone: "Asia/Kathmandu", style: "sentence", limit: 2 });
    expect(s).toBe("Tue 13 Oct 10:00–10:30 or Wed 14 Oct 14:00–14:30 (NPT)");
  });

  it("uses DST-aware abbreviations", () => {
    const s = [{ start: "2026-07-01T13:00:00Z", end: "2026-07-01T13:30:00Z" }];
    expect(proposeText(s, { timezone: "America/New_York" })).toBe("Wed 1 Jul, 09:00–09:30 (EDT)");
    expect(zoneLabel(Date.parse("2026-12-01T00:00:00Z"), "America/New_York")).toBe("EST");
  });

  it("Nepali locale when Intl supports it", () => {
    const out = proposeText(slots, { timezone: "Asia/Kathmandu", locale: "ne", limit: 1 });
    if (resolveLocale("ne") === "ne-NP") {
      expect(out).toContain("नेपाल समय");
      expect(out).toMatch(/[०-९]/);
    } else {
      expect(out).toBe("Tue 13 Oct, 10:00–10:30 (NPT)");
    }
  });

  it("custom zone label", () => {
    expect(proposeText(slots, { timezone: "Asia/Kathmandu", limit: 1, zoneLabel: "Kathmandu" })).toBe("Tue 13 Oct, 10:00–10:30 (Kathmandu)");
  });

  it("multi-day slot shows both dates", () => {
    const s = [{ start: "2026-10-13T17:45:00Z", end: "2026-10-13T18:45:00Z" }];
    expect(proposeText(s, { timezone: "Asia/Kathmandu" })).toBe("Tue 13 Oct, 23:30 – Wed 14 Oct, 00:30 (NPT)");
  });

  it("returns empty string for nothing valid", () => {
    expect(proposeText([], { timezone: "UTC" })).toBe("");
    expect(proposeText([{ start: "x", end: "y" }], { timezone: "UTC" })).toBe("");
    expect(proposeText(slots, { timezone: "Not/AZone" })).toBe("");
  });
});

describe("invite", () => {
  const slot = { start: "2026-10-13T04:15:00Z", end: "2026-10-13T04:45:00Z" };
  const opts = {
    title: "Intro call",
    organizer: { name: "Lacspace Sales", email: "sales@lacspace.com" },
    attendees: [{ name: "Sita, Sharma", email: "sita@example.com" }, { email: "ram@example.com" }],
    uid: "abc-123@lacspace.com",
    now: "2026-10-07T10:00:00Z",
  };

  it("writes a valid REQUEST", () => {
    const { ics, method } = invite(slot, opts);
    expect(method).toBe("REQUEST");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("\r\nMETHOD:REQUEST\r\n");
    expect(ics).toContain("\r\nVERSION:2.0\r\n");
    expect(ics).toContain("\r\nPRODID:");
    expect(ics).toContain("\r\nUID:abc-123@lacspace.com\r\n");
    expect(ics).toContain("\r\nDTSTAMP:20261007T100000Z\r\n");
    expect(ics).toContain("\r\nDTSTART:20261013T041500Z\r\n");
    expect(ics).toContain("\r\nDTEND:20261013T044500Z\r\n");
    expect(ics).toContain("\r\nORGANIZER;CN=Lacspace Sales:mailto:sales@lacspace.com\r\n");
  });

  it("uses CRLF only", () => {
    const { ics } = invite(slot, opts);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("quotes CN params with commas", () => {
    expect(invite(slot, opts).ics.replace(/\r\n /g, "")).toContain('ATTENDEE;CN="Sita, Sharma";');
  });

  it("lists every attendee with RSVP", () => {
    const ics = invite(slot, opts).ics.replace(/\r\n /g, "");
    expect(ics.match(/^ATTENDEE.*RSVP=TRUE:mailto:/gm)).toHaveLength(2);
    expect(ics).toContain("mailto:ram@example.com");
  });

  it("escapes TEXT values", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const ics = invite(slot, { ...opts, description: "Agenda:\n1, intro; 2. demo" }).ics;
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:Agenda:\\n1\\, intro\\; 2. demo");
  });

  it("folds long lines at 75 octets", () => {
    const ics = invite(slot, { ...opts, description: "x".repeat(300) }).ics;
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:" + "x".repeat(300));
  });

  it("folding never splits UTF-8 characters", () => {
    const text = "नमस्ते 🙏 ".repeat(30);
    const folded = foldLine("DESCRIPTION:" + text);
    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
    expect(folded.replace(/\r\n /g, "")).toBe("DESCRIPTION:" + text);
  });

  it("short lines are not folded", () => {
    expect(foldLine("SUMMARY:Hi")).toBe("SUMMARY:Hi");
  });

  it("adds location, url and timezone hint", () => {
    const ics = invite(slot, { ...opts, location: "Kathmandu, Nepal", url: "https://meet.example.com/x", timezone: "Asia/Kathmandu" }).ics;
    expect(ics).toContain("LOCATION:Kathmandu\\, Nepal\r\n");
    expect(ics).toContain("URL:https://meet.example.com/x\r\n");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Kathmandu\r\n");
  });

  it("generates a UID when none is given", () => {
    const a = invite(slot, { ...opts, uid: undefined }).ics;
    const b = invite(slot, { ...opts, uid: undefined }).ics;
    const ua = /UID:(.+)\r\n/.exec(a)![1];
    expect(ua).toBeTruthy();
    expect(ua).not.toBe(/UID:(.+)\r\n/.exec(b)![1]);
  });

  it("strips CR/LF injection from emails and names", () => {
    const ics = invite(slot, { ...opts, attendees: [{ name: "Eve\r\nATTENDEE:mailto:x@y", email: "eve@example.com\r\nX:1" }] }).ics;
    expect(ics).not.toContain("\r\nATTENDEE:mailto:x@y");
    expect(ics).not.toContain("\r\nX:1");
  });

  it("returns empty ics on invalid slot or organizer", () => {
    expect(invite({ start: "x", end: "y" }, opts).ics).toBe("");
    expect(invite({ start: slot.end, end: slot.start }, opts).ics).toBe("");
    expect(invite(slot, { ...opts, organizer: { email: "" } }).ics).toBe("");
  });
});
