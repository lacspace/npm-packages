import { describe, expect, it } from "vitest";
import {
  WINDOWS_TIMEZONES,
  buildCancelIcs,
  buildIcs,
  buildReplyIcs,
  escapeText,
  fold,
  parseContentLine,
  parseDateTime,
  parseIcs,
  parseIcsEvent,
  replyEmail,
  unescapeText,
  unfold,
} from "./index";

const crlf = (s: string) => s.replace(/^\s*\n/, "").replace(/\n/g, "\r\n");
const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;
const physLines = (ics: string) => ics.split("\r\n").filter((l) => l !== "");

const GOOGLE = crlf(`
BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:20261015T093000Z
DTEND:20261015T100000Z
DTSTAMP:20261007T080000Z
ORGANIZER;CN=Priya Sharma:mailto:priya@example.com
UID:7kukuqrfedlm2f9t0ntqjmh2hc@google.com
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=
 TRUE;CN=Ram Thapa;X-NUM-GUESTS=0:mailto:ram@example.org
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE
 ;CN=Priya Sharma;X-NUM-GUESTS=0:mailto:priya@example.com
ATTENDEE;CUTYPE=RESOURCE;ROLE=NON-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Room 4,
  Lalitpur";X-NUM-GUESTS=0:mailto:c_188@resource.calendar.google.com
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
CREATED:20261007T075900Z
DESCRIPTION:Agenda:\\n1. Roadmap\\n2. Hiring\\, budget\\n\\n-::~:~::~:~:~:~::-\\n
 Join with Google Meet: https://meet.google.com/abc-defg-hij
LAST-MODIFIED:20261007T080000Z
LOCATION:Room 4\\, Lalitpur
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Q4 planning
TRANSP:OPAQUE
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:This is an event reminder
TRIGGER:-P0DT0H30M0S
END:VALARM
END:VEVENT
END:VCALENDAR
`);

const OUTLOOK = crlf(`
BEGIN:VCALENDAR
METHOD:REQUEST
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Nepal Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0545
TZOFFSETTO:+0545
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T000000
TZOFFSETFROM:+0545
TZOFFSETTO:+0545
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
ORGANIZER;CN="Shrestha, Anil":mailto:anil@contoso.com
ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Sita Rai:mailto:Sita@Contoso.com
ATTENDEE;ROLE=OPT-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Hari KC:mailto:hari@contoso.com
DESCRIPTION;LANGUAGE=en-US:Sprint demo.\\n\\n______________\\nMicrosoft Teams meeting\\nJoin: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x\\n
UID:040000008200E00074C5B7101A82E0080000000010B5C0A1D3E6DB01000000000000000010000000
SUMMARY;LANGUAGE=en-US:Sprint review
DTSTART;TZID=Nepal Standard Time:20261020T140000
DTEND;TZID=Nepal Standard Time:20261020T150000
CLASS:PUBLIC
PRIORITY:5
DTSTAMP:20261007T051500Z
TRANSP:OPAQUE
STATUS:CONFIRMED
SEQUENCE:2
LOCATION;LANGUAGE=en-US:Microsoft Teams Meeting
X-MICROSOFT-CDO-APPT-SEQUENCE:2
BEGIN:VALARM
DESCRIPTION:REMINDER
TRIGGER;RELATED=START:-PT15M
ACTION:DISPLAY
END:VALARM
END:VEVENT
END:VCALENDAR
`);

const APPLE = crlf(`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//macOS 15.0//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
CREATED:20260901T101010Z
DTEND;VALUE=DATE:20261024
DTSTAMP:20260901T101012Z
DTSTART;VALUE=DATE:20261020
LAST-MODIFIED:20260901T101010Z
SEQUENCE:0
SUMMARY:Dashain holiday
CATEGORIES:Holiday,Family
CATEGORIES:Nepal
TRANSP:TRANSPARENT
UID:5F1E7C2A-0B4C-4C1E-9D7E-2B6A1F0E3D9C
X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC
END:VEVENT
END:VCALENDAR
`);

const ev = (body: string, head = "") =>
  crlf(`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
${head}BEGIN:VEVENT
UID:t1
${body}
END:VEVENT
END:VCALENDAR
`);

describe("Google Calendar invite", () => {
  const cal = parseIcs(GOOGLE);
  const e = cal.events[0]!;
  it("calendar fields", () => {
    expect(cal.method).toBe("REQUEST");
    expect(cal.prodId).toContain("Google");
    expect(cal.events).toHaveLength(1);
  });
  it("core event fields", () => {
    expect(e.uid).toBe("7kukuqrfedlm2f9t0ntqjmh2hc@google.com");
    expect(e.summary).toBe("Q4 planning");
    expect(e.start).toBe("2026-10-15T09:30:00Z");
    expect(e.end).toBe("2026-10-15T10:00:00Z");
    expect(e.allDay).toBe(false);
    expect(e.sequence).toBe(0);
    expect(e.status).toBe("CONFIRMED");
    expect(e.transp).toBe("OPAQUE");
    expect(e.location).toBe("Room 4, Lalitpur");
    expect(e.created).toBe("2026-10-07T07:59:00Z");
    expect(e.lastModified).toBe("2026-10-07T08:00:00Z");
    expect(e.dtstamp).toBe("2026-10-07T08:00:00Z");
  });
  it("unescapes and unfolds description", () => {
    expect(e.description).toBe(
      "Agenda:\n1. Roadmap\n2. Hiring, budget\n\n-::~:~::~:~:~:~::-\nJoin with Google Meet: https://meet.google.com/abc-defg-hij",
    );
  });
  it("organizer and attendees (folded params, quoted CN with comma)", () => {
    expect(e.organizer).toEqual({ name: "Priya Sharma", address: "priya@example.com" });
    expect(e.attendees).toHaveLength(3);
    expect(e.attendees[0]).toEqual({
      name: "Ram Thapa",
      address: "ram@example.org",
      role: "REQ-PARTICIPANT",
      partstat: "NEEDS-ACTION",
      rsvp: true,
      cutype: "INDIVIDUAL",
    });
    expect(e.attendees[2]!.name).toBe("Room 4, Lalitpur");
    expect(e.attendees[2]!.cutype).toBe("RESOURCE");
  });
  it("conference link and alarm", () => {
    expect(e.conference).toBe("https://meet.google.com/abc-defg-hij");
    expect(e.alarms).toEqual([{ action: "DISPLAY", trigger: "-P0DT0H30M0S", description: "This is an event reminder" }]);
  });
  it("raw keeps every property", () => {
    expect(e.raw["X-GOOGLE-CONFERENCE"]).toEqual(["https://meet.google.com/abc-defg-hij"]);
    expect(e.raw.ATTENDEE).toHaveLength(3);
    expect(e.raw.ACTION).toBeUndefined(); // alarm props are not mixed in
  });
});

describe("Outlook / Exchange invite", () => {
  const cal = parseIcs(OUTLOOK);
  const e = cal.events[0]!;
  it("Windows TZID Nepal Standard Time → +05:45", () => {
    expect(e.start).toBe("2026-10-20T08:15:00Z");
    expect(e.end).toBe("2026-10-20T09:15:00Z");
    expect(e.startTzid).toBe("Nepal Standard Time");
    expect(e.endTzid).toBe("Nepal Standard Time");
    expect(cal.timezones).toEqual(["Nepal Standard Time"]);
  });
  it("organizer CN with comma, LANGUAGE param ignored, sequence", () => {
    expect(e.organizer).toEqual({ name: "Shrestha, Anil", address: "anil@contoso.com" });
    expect(e.summary).toBe("Sprint review");
    expect(e.sequence).toBe(2);
    expect(e.attendees.map((a) => a.role)).toEqual(["REQ-PARTICIPANT", "OPT-PARTICIPANT"]);
  });
  it("Teams link extracted from description", () => {
    expect(e.conference).toBe("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x");
  });
  it("alarm with RELATED param", () => {
    expect(e.alarms[0]).toEqual({ action: "DISPLAY", trigger: "-PT15M", description: "REMINDER" });
  });
  it("other Windows zone names", () => {
    const at = (tz: string, local: string) => parseDateTime(local, { TZID: tz })!.value;
    expect(at("India Standard Time", "20261020T140000")).toBe("2026-10-20T08:30:00Z");
    expect(at("Pacific Standard Time", "20260115T090000")).toBe("2026-01-15T17:00:00Z");
    expect(at("Pacific Standard Time", "20260715T090000")).toBe("2026-07-15T16:00:00Z");
    expect(at("W. Europe Standard Time", "20260715T090000")).toBe("2026-07-15T07:00:00Z");
    expect(at("Eastern Standard Time", "20260115T090000")).toBe("2026-01-15T14:00:00Z");
    expect(at("GMT Standard Time", "20260715T090000")).toBe("2026-07-15T08:00:00Z");
    expect(at("China Standard Time", "20260715T090000")).toBe("2026-07-15T01:00:00Z");
    expect(at("Tokyo Standard Time", "20260715T090000")).toBe("2026-07-15T00:00:00Z");
    expect(at("AUS Eastern Standard Time", "20260115T090000")).toBe("2026-01-14T22:00:00Z");
    expect(at("Arabian Standard Time", "20260715T090000")).toBe("2026-07-15T05:00:00Z");
    expect(at("UTC", "20260715T090000")).toBe("2026-07-15T09:00:00Z");
  });
  it("every WINDOWS_TIMEZONES entry is a valid IANA zone in this runtime", () => {
    for (const [win, iana] of Object.entries(WINDOWS_TIMEZONES)) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: iana }), win).not.toThrow();
    }
  });
});

describe("custom VTIMEZONE rules", () => {
  const VTZ = `BEGIN:VTIMEZONE
TZID:Custom Eastern
BEGIN:STANDARD
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE
`;
  const at = (local: string) =>
    parseIcsEvent(ev(`DTSTART;TZID=Custom Eastern:${local}`, VTZ))!.start;
  it("applies BYMONTH/BYDAY DST rules", () => {
    expect(at("20260115T100000")).toBe("2026-01-15T15:00:00Z");
    expect(at("20260715T100000")).toBe("2026-07-15T14:00:00Z");
    expect(at("20260308T030000")).toBe("2026-03-08T07:00:00Z");
    expect(at("20260308T023000")).toBe("2026-03-08T07:30:00Z"); // gap → offset before
    expect(at("20261101T013000")).toBe("2026-11-01T05:30:00Z"); // overlap → first
  });
  it("falls back to TZOFFSETTO for rule-less custom zones", () => {
    const vtz = `BEGIN:VTIMEZONE
TZID:Kathmandu Custom
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0545
TZOFFSETTO:+0545
END:STANDARD
END:VTIMEZONE
`;
    expect(parseIcsEvent(ev("DTSTART;TZID=Kathmandu Custom:20261020T140000", vtz))!.start).toBe("2026-10-20T08:15:00Z");
  });
  it("unknown TZID without VTIMEZONE: defaultTimeZone, else UTC", () => {
    const text = ev("DTSTART;TZID=Mars Standard Time:20261020T140000");
    expect(parseIcsEvent(text)!.start).toBe("2026-10-20T14:00:00Z");
    expect(parseIcsEvent(text, { defaultTimeZone: "Asia/Kathmandu" })!.start).toBe("2026-10-20T08:15:00Z");
  });
  it("vendor-prefixed IANA TZID", () => {
    expect(parseIcsEvent(ev("DTSTART;TZID=/mozilla.org/20070129_1/Europe/London:20260715T120000"))!.start).toBe(
      "2026-07-15T11:00:00Z",
    );
  });
});

describe("Apple all-day event", () => {
  const e = parseIcsEvent(APPLE)!;
  it("DATE values", () => {
    expect(e.allDay).toBe(true);
    expect(e.start).toBe("2026-10-20");
    expect(e.end).toBe("2026-10-24");
    expect(e.organizer).toBeNull();
    expect(e.attendees).toEqual([]);
    expect(e.transp).toBe("TRANSPARENT");
  });
  it("multiple CATEGORIES lines and values", () => {
    expect(e.categories).toEqual(["Holiday", "Family", "Nepal"]);
  });
  it("all-day without DTEND lasts one day", () => {
    expect(parseIcsEvent(ev("DTSTART;VALUE=DATE:20261231"))!.end).toBe("2027-01-01");
  });
});

describe("unfolding and folding", () => {
  it("unfolds CRLF and LF with space or tab", () => {
    expect(unfold("SUMMARY:ab\r\n c\n\td")).toBe("SUMMARY:abcd");
  });
  it("unfolds bytes before decoding when a fold splits a multibyte char", () => {
    const line = "SUMMARY:नमस्ते संसार";
    const b = enc.encode(`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\n${line}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
    const at = b.indexOf(0xe0, 40) + 1; // inside the first Devanagari char after "SUMMARY:"
    const split = new Uint8Array([...b.slice(0, at), 0x0d, 0x0a, 0x20, ...b.slice(at)]);
    expect(parseIcsEvent(split)!.summary).toBe("नमस्ते संसार");
    expect(unfold(split)).toContain(line);
  });
  it("fold keeps ASCII lines at exactly 75 octets", () => {
    const f = fold("DESCRIPTION:" + "x".repeat(200));
    const ls = f.split("\r\n");
    expect(bytes(ls[0]!)).toBe(75);
    expect(bytes(ls[1]!)).toBe(75);
    expect(ls[1]!.startsWith(" ")).toBe(true);
    expect(unfold(f)).toBe("DESCRIPTION:" + "x".repeat(200));
  });
  it("fold never splits a surrogate pair", () => {
    const f = fold("SUMMARY:" + "😀".repeat(40));
    for (const l of f.split("\r\n")) expect(l).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(unfold(f)).toBe("SUMMARY:" + "😀".repeat(40));
  });
});

describe("text escaping", () => {
  it("escape/unescape round-trip", () => {
    const s = "a,b;c\\d\nnew line\r\nx";
    expect(escapeText(s)).toBe("a\\,b\\;c\\\\d\\nnew line\\nx");
    expect(unescapeText(escapeText(s))).toBe("a,b;c\\d\nnew line\nx");
  });
  it("\\N and stray \\: are accepted", () => {
    expect(unescapeText("a\\Nb\\:c")).toBe("a\nb:c");
  });
  it("content line params: quoted values, commas, colons, RFC 6868", () => {
    const cl = parseContentLine(
      'ATTENDEE;CN="Doe, John: PM";DELEGATED-TO="mailto:a@x.com","mailto:b@x.com";X-NOTE=say ^\'hi^\':mailto:j@x.com',
    )!;
    expect(cl.name).toBe("ATTENDEE");
    expect(cl.params.CN).toEqual(["Doe, John: PM"]);
    expect(cl.params["DELEGATED-TO"]).toEqual(["mailto:a@x.com", "mailto:b@x.com"]);
    expect(cl.params["X-NOTE"]).toEqual(['say "hi"']);
    expect(cl.value).toBe("mailto:j@x.com");
  });
});

describe("dates, durations, floating", () => {
  it("DURATION when no DTEND", () => {
    expect(parseIcsEvent(ev("DTSTART:20261015T093000Z\r\nDURATION:PT45M"))!.end).toBe("2026-10-15T10:15:00Z");
    const e = parseIcsEvent(ev("DTSTART;VALUE=DATE:20261020\r\nDURATION:P2D"))!;
    expect(e.end).toBe("2026-10-22");
    expect(e.duration).toBe("P2D");
  });
  it("DURATION days are nominal across a DST change", () => {
    const e = parseIcsEvent(ev("DTSTART;TZID=America/New_York:20261031T120000\r\nDURATION:P1DT1H"))!;
    expect(e.start).toBe("2026-10-31T16:00:00Z");
    expect(e.end).toBe("2026-11-01T18:00:00Z");
  });
  it("floating time: UTC by default, defaultTimeZone when given", () => {
    const text = ev("DTSTART:20261015T090000");
    expect(parseIcsEvent(text)!.start).toBe("2026-10-15T09:00:00Z");
    expect(parseIcsEvent(text, { defaultTimeZone: "Asia/Kathmandu" })!.start).toBe("2026-10-15T03:15:00Z");
    expect(parseDateTime("20261015T090000")!.floating).toBe(true);
  });
  it("Z wins over TZID; VALUE=DATE", () => {
    expect(parseDateTime("20261015T090000Z", { TZID: "Asia/Tokyo" })!.value).toBe("2026-10-15T09:00:00Z");
    expect(parseDateTime("20261015", { VALUE: "DATE" })).toMatchObject({ value: "2026-10-15", allDay: true });
    expect(parseDateTime("garbage")).toBeNull();
    expect(parseDateTime("20261315T090000Z")).toBeNull();
  });
  it("DST boundaries America/New_York", () => {
    const at = (l: string) => parseDateTime(l, { TZID: "America/New_York" })!.value;
    expect(at("20260308T013000")).toBe("2026-03-08T06:30:00Z");
    expect(at("20260308T023000")).toBe("2026-03-08T07:30:00Z"); // non-existent → offset before
    expect(at("20260308T030000")).toBe("2026-03-08T07:00:00Z");
    expect(at("20261101T013000")).toBe("2026-11-01T05:30:00Z"); // ambiguous → first (EDT)
    expect(at("20261101T020000")).toBe("2026-11-01T07:00:00Z");
  });
  it("DST boundaries Europe/London", () => {
    const at = (l: string) => parseDateTime(l, { TZID: "Europe/London" })!.value;
    expect(at("20260329T003000")).toBe("2026-03-29T00:30:00Z");
    expect(at("20260329T013000")).toBe("2026-03-29T01:30:00Z"); // gap
    expect(at("20260329T020000")).toBe("2026-03-29T01:00:00Z");
    expect(at("20261025T013000")).toBe("2026-10-25T00:30:00Z"); // overlap → BST
    expect(at("20261025T020000")).toBe("2026-10-25T02:00:00Z");
    expect(at("20260715T120000")).toBe("2026-07-15T11:00:00Z");
  });
});

describe("recurrence", () => {
  const SERIES = crlf(`
BEGIN:VCALENDAR
VERSION:2.0
METHOD:REQUEST
BEGIN:VEVENT
UID:series-1
SEQUENCE:1
DTSTART;TZID=Europe/London:20261005T090000
DTEND;TZID=Europe/London:20261005T093000
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10
EXDATE;TZID=Europe/London:20261012T090000,20261019T090000
EXDATE;TZID=Europe/London:20261102T090000
RDATE;VALUE=DATE:20261225
RDATE;VALUE=PERIOD:20261230T090000Z/PT1H
ORGANIZER;CN=Boss:mailto:boss@x.com
ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:me@x.com
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:series-1
SEQUENCE:1
RECURRENCE-ID;TZID=Europe/London:20261026T090000
DTSTART;TZID=Europe/London:20261026T100000
DTEND;TZID=Europe/London:20261026T103000
ORGANIZER;CN=Boss:mailto:boss@x.com
ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:me@x.com
SUMMARY:Standup (moved)
END:VEVENT
END:VCALENDAR
`);
  const cal = parseIcs(SERIES);
  it("RRULE / EXDATE / RDATE passthrough", () => {
    const e = cal.events[0]!;
    expect(e.rrule).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=10");
    expect(e.exdate).toEqual(["2026-10-12T08:00:00Z", "2026-10-19T08:00:00Z", "2026-11-02T09:00:00Z"]);
    expect(e.rdate).toEqual(["2026-12-25", "20261230T090000Z/PT1H"]);
  });
  it("RECURRENCE-ID overrides are separate events with the same uid", () => {
    expect(cal.events).toHaveLength(2);
    const o = cal.events[1]!;
    expect(o.uid).toBe("series-1");
    expect(o.recurrenceId).toBe("2026-10-26T09:00:00Z"); // after BST ended → GMT
    expect(o.start).toBe("2026-10-26T10:00:00Z");
    expect(cal.events[0]!.recurrenceId).toBeUndefined();
  });
  it("reply to an override carries RECURRENCE-ID", () => {
    const r = buildReplyIcs({ invite: cal.events[1]!, attendee: { address: "me@x.com" }, partstat: "DECLINED" });
    expect(r).toContain("RECURRENCE-ID:20261026T090000Z\r\n");
    expect(parseIcsEvent(r)!.recurrenceId).toBe("2026-10-26T09:00:00Z");
  });
});

describe("malformed input never throws", () => {
  it("garbage, empty, partial", () => {
    for (const bad of ["", "hello world", "BEGIN:VEVENT", "END:VCALENDAR\nEND:VEVENT", ":::;;;", "\u0000￿", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:nope\r\nATTENDEE;CN=\"unterminated:mailto:a@b\r\n"]) {
      expect(() => parseIcs(bad)).not.toThrow();
    }
    expect(parseIcs("").events).toEqual([]);
    expect(parseIcs(null as unknown as string).events).toEqual([]);
  });
  it("missing UID → '' and bad DTSTART → '' (event kept)", () => {
    const e = parseIcsEvent("BEGIN:VEVENT\nSUMMARY:x\nDTSTART:bogus\nSEQUENCE:abc\nEND:VEVENT")!;
    expect(e.uid).toBe("");
    expect(e.start).toBe("");
    expect(e.sequence).toBe(0);
    expect(e.summary).toBe("x");
  });
  it("skips bad lines, tolerates unclosed components", () => {
    const e = parseIcsEvent("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u\nthis is not a property\nSUMMARY:ok\n")!;
    expect(e.uid).toBe("u");
    expect(e.summary).toBe("ok");
  });
  it("every truncation of a real invite parses", () => {
    for (let i = 0; i < OUTLOOK.length; i += 37) expect(() => parseIcs(OUTLOOK.slice(0, i))).not.toThrow();
  });
});

describe("buildIcs", () => {
  const STAMP = new Date("2026-10-07T00:00:00Z");
  it("calendar envelope, CRLF, UTC times", () => {
    const ics = buildIcs({
      uid: "u1@lacspace.com",
      summary: "Launch",
      start: new Date("2026-10-15T09:30:00Z"),
      end: new Date("2026-10-15T10:00:00Z"),
      method: "REQUEST",
      dtstamp: STAMP,
      organizer: { name: "Chandan", address: "chandan@lacspace.com" },
      attendees: [{ name: "Ram", address: "ram@example.org" }],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lacspace//Lacspace Mail//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:REQUEST\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain("DTSTAMP:20261007T000000Z\r\n");
    expect(ics).toContain("DTSTART:20261015T093000Z\r\n");
    expect(ics).toContain("SEQUENCE:0\r\n");
    expect(ics).toContain("ORGANIZER;CN=Chandan:mailto:chandan@lacspace.com\r\n");
    expect(unfold(ics)).toContain("ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Ram:mailto:ram@example.org\r\n");
  });
  it("generates a uid when missing", () => {
    const a = parseIcsEvent(buildIcs({ summary: "x", start: "2026-10-15" }))!;
    const b = parseIcsEvent(buildIcs({ summary: "x", start: "2026-10-15" }))!;
    expect(a.uid).toMatch(/@lacspace\.com$/);
    expect(a.uid).not.toBe(b.uid);
  });
  it("folds Devanagari at 75 octets without splitting characters (byte-exact)", () => {
    const summary = "नेपाल सरकारको बैठक: बजेट छलफल र योजना आयोगको प्रस्तुति, काठमाडौं";
    const ics = buildIcs({ uid: "dev", summary, start: "2026-10-15", dtstamp: STAMP });
    const lines = physLines(ics);
    const dec = new TextDecoder("utf-8", { fatal: true });
    for (const l of lines) {
      expect(bytes(l)).toBeLessThanOrEqual(75);
      expect(() => dec.decode(enc.encode(l))).not.toThrow();
    }
    const i = lines.findIndex((l) => l.startsWith("SUMMARY:"));
    const first = lines[i]!;
    // "SUMMARY:" is 8 bytes; next char would push past 75
    expect(bytes(first)).toBeGreaterThan(72);
    const nextChar = [...lines[i + 1]!.slice(1)][0]!;
    expect(bytes(first) + bytes(nextChar)).toBeGreaterThan(75);
    expect(parseIcsEvent(ics)!.summary).toBe(summary);
  });
  it("escapes TEXT and round-trips special characters", () => {
    const description = "Line 1\nLine 2; with, punctuation \\ backslash";
    const ics = buildIcs({ uid: "e", summary: "A, B; C", start: "2026-10-15", description, location: "Hall 1, Floor 2", dtstamp: STAMP });
    expect(ics).toContain("SUMMARY:A\\, B\\; C\r\n");
    const e = parseIcsEvent(ics)!;
    expect(e.description).toBe(description);
    expect(e.location).toBe("Hall 1, Floor 2");
  });
  it("all-day defaults DTEND to next day", () => {
    const ics = buildIcs({ uid: "a", summary: "Holiday", start: "2026-10-20", dtstamp: STAMP });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261020\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261021\r\n");
    expect(ics).not.toContain("VTIMEZONE");
  });
  it("TZID + VTIMEZONE derived from Intl (America/New_York)", () => {
    const ics = buildIcs({ uid: "tz", summary: "Sync", start: "2026-07-15T10:00", end: "2026-07-15T11:00", timeZone: "America/New_York", dtstamp: STAMP });
    expect(ics).toContain("DTSTART;TZID=America/New_York:20260715T100000\r\n");
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\n");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU");
    expect(ics).toMatch(/BEGIN:DAYLIGHT\r\nDTSTART:20250309T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400/);
    expect(parseIcsEvent(ics)!.start).toBe("2026-07-15T14:00:00Z");
  });
  it("generated VTIMEZONE is self-sufficient under a custom TZID", () => {
    const ics = buildIcs({ uid: "tz2", summary: "x", start: "2026-01-15T10:00", timeZone: "Europe/London", dtstamp: STAMP })
      .replace(/Europe\/London/g, "My London");
    const at = (local: string) => parseIcsEvent(ics.replace(/DTSTART;TZID=My London:\d+T\d+/, `DTSTART;TZID=My London:${local}`))!.start;
    expect(at("20260115T100000")).toBe("2026-01-15T10:00:00Z");
    expect(at("20260715T100000")).toBe("2026-07-15T09:00:00Z");
    expect(at("20261025T013000")).toBe("2026-10-25T00:30:00Z");
  });
  it("zone without DST gets a single STANDARD observance (Asia/Kathmandu)", () => {
    const ics = buildIcs({ uid: "k", summary: "x", start: new Date("2026-10-20T08:15:00Z"), timeZone: "Asia/Kathmandu", dtstamp: STAMP });
    expect(ics).toContain("DTSTART;TZID=Asia/Kathmandu:20261020T140000\r\n");
    expect(ics).toContain("BEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0545\r\nTZOFFSETTO:+0545\r\nEND:STANDARD");
    expect(ics).not.toContain("DAYLIGHT");
  });
  it("alarms, rrule, status, url", () => {
    const ics = buildIcs({
      uid: "r", summary: "Gym", start: new Date("2026-10-15T01:00:00Z"), dtstamp: STAMP,
      rrule: "FREQ=WEEKLY;BYDAY=TH", status: "TENTATIVE", url: "https://lacspace.com/e/1",
      alarms: [{ trigger: 15 }, { action: "AUDIO", trigger: "-PT1H" }],
    });
    const e = parseIcsEvent(ics)!;
    expect(e.rrule).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(e.status).toBe("TENTATIVE");
    expect(e.url).toBe("https://lacspace.com/e/1");
    expect(e.alarms).toEqual([
      { action: "DISPLAY", trigger: "-PT15M", description: "Gym" },
      { action: "AUDIO", trigger: "-PT1H" },
    ]);
  });
  it("round trip parseIcs(buildIcs(x))", () => {
    const x = {
      uid: "rt@lacspace.com",
      summary: "दशैं भेटघाट, Kathmandu",
      start: new Date("2026-10-15T09:30:00Z"),
      end: new Date("2026-10-15T11:00:00Z"),
      location: "Lacspace HQ; Floor 3",
      description: "Bring:\n- tika\n- jamara",
      method: "REQUEST" as const,
      sequence: 4,
      organizer: { name: "Org, Name", address: "org@lacspace.com" },
      attendees: [{ name: "A", address: "a@x.com", role: "OPT-PARTICIPANT" }],
      dtstamp: STAMP,
    };
    const cal = parseIcs(buildIcs(x));
    const e = cal.events[0]!;
    expect(cal.method).toBe("REQUEST");
    expect(e).toMatchObject({
      uid: x.uid, summary: x.summary, location: x.location, description: x.description,
      start: "2026-10-15T09:30:00Z", end: "2026-10-15T11:00:00Z", sequence: 4, allDay: false,
      organizer: { name: "Org, Name", address: "org@lacspace.com" }, dtstamp: "2026-10-07T00:00:00Z",
    });
    expect(e.attendees[0]).toMatchObject({ address: "a@x.com", role: "OPT-PARTICIPANT", partstat: "NEEDS-ACTION", rsvp: true });
  });
  it("throws only on an invalid start", () => {
    expect(() => buildIcs({ summary: "x", start: "not a date" })).toThrow(TypeError);
  });
});

describe("iTIP REPLY (RFC 5546 §3.2.3)", () => {
  const STAMP = new Date("2026-10-08T12:00:00Z");
  const reply = buildReplyIcs({
    invite: OUTLOOK,
    attendee: { address: "sita@contoso.com" },
    partstat: "ACCEPTED",
    comment: "See you there, thanks!",
    dtstamp: STAMP,
  });
  const cal = parseIcs(reply);
  const e = cal.events[0]!;
  it("METHOD:REPLY with same UID, SEQUENCE, ORGANIZER", () => {
    expect(cal.method).toBe("REPLY");
    expect(e.uid).toBe("040000008200E00074C5B7101A82E0080000000010B5C0A1D3E6DB01000000000000000010000000");
    expect(e.sequence).toBe(2);
    expect(e.organizer).toEqual({ name: "Shrestha, Anil", address: "anil@contoso.com" });
    expect(e.dtstamp).toBe("2026-10-08T12:00:00Z");
    expect(e.start).toBe("2026-10-20T08:15:00Z");
    expect(e.recurrenceId).toBeUndefined();
  });
  it("only the replying ATTENDEE, with PARTSTAT and invite CN, no RSVP", () => {
    expect(e.attendees).toEqual([{ name: "Sita Rai", address: "sita@contoso.com", role: "REQ-PARTICIPANT", partstat: "ACCEPTED" }]);
    expect(reply).not.toContain("RSVP");
    expect(reply.match(/^ATTENDEE/gm)).toHaveLength(1);
  });
  it("COMMENT escaped; no VALARM / DESCRIPTION leak", () => {
    expect(reply).toContain("COMMENT:See you there\\, thanks!\r\n");
    expect(reply).not.toContain("VALARM");
    expect(reply).not.toContain("DESCRIPTION");
  });
  it("accepts a parsed IcsEvent as invite", () => {
    const r = buildReplyIcs({ invite: parseIcsEvent(GOOGLE)!, attendee: { name: "Ram T", address: "ram@example.org" }, partstat: "TENTATIVE", dtstamp: STAMP });
    expect(unfold(r)).toContain("ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=TENTATIVE;CN=Ram T:mailto:ram@example.org\r\n");
    expect(r).toContain("UID:7kukuqrfedlm2f9t0ntqjmh2hc@google.com\r\n");
  });
  it("throws when the invite has no VEVENT", () => {
    expect(() => buildReplyIcs({ invite: "nothing", attendee: { address: "a@b" }, partstat: "ACCEPTED" })).toThrow();
  });
});

describe("CANCEL and replyEmail", () => {
  it("buildCancelIcs increments sequence and keeps attendees", () => {
    const c = parseIcs(buildCancelIcs(OUTLOOK));
    expect(c.method).toBe("CANCEL");
    const e = c.events[0]!;
    expect(e.sequence).toBe(3);
    expect(e.status).toBe("CANCELLED");
    expect(e.attendees).toHaveLength(2);
    expect(parseIcsEvent(buildCancelIcs(OUTLOOK, { sequence: 9 }))!.sequence).toBe(9);
  });
  it("replyEmail subject/content type/recipient", () => {
    const m = replyEmail(GOOGLE, { name: "Ram Thapa", address: "ram@example.org" }, "ACCEPTED");
    expect(m.subject).toBe("Accepted: Q4 planning");
    expect(m.contentType).toBe("text/calendar; method=REPLY; charset=UTF-8");
    expect(m.to).toBe("priya@example.com");
    expect(m.text).toContain("Ram Thapa <ram@example.org> has accepted this invitation.");
    expect(parseIcs(m.ics).method).toBe("REPLY");
    expect(replyEmail(GOOGLE, { address: "ram@example.org" }, "DECLINED").subject).toBe("Declined: Q4 planning");
    expect(replyEmail(GOOGLE, { address: "ram@example.org" }, "TENTATIVE").subject).toBe("Tentative: Q4 planning");
  });
});
