# @lacspace/ics

A small iCalendar (RFC 5545) and iTIP (RFC 5546) parser and builder for webmail. Use it to:
- show a meeting invite inside a message;
- send Accept, Decline or Tentative replies;
- create and cancel invites.

It reads what Google Calendar, Outlook/Exchange and Apple Calendar send, including Windows time-zone names like `Nepal Standard Time`. It has no dependencies and runs in Node 18+, edge runtimes and browsers.

```ts
import { parseIcsEvent, replyEmail, buildIcs } from "@lacspace/ics";

const ev = parseIcsEvent(icsText);
// { uid: "040000008200E…", sequence: 2, summary: "Sprint review",
//   start: "2026-10-20T08:15:00Z", end: "2026-10-20T09:15:00Z", allDay: false,
//   startTzid: "Nepal Standard Time", organizer: { name: "Shrestha, Anil", address: "anil@contoso.com" },
//   attendees: [{ name: "Sita Rai", address: "sita@contoso.com", role: "REQ-PARTICIPANT", partstat: "NEEDS-ACTION", rsvp: true }],
//   conference: "https://teams.microsoft.com/l/meetup-join/…", alarms: [{ action: "DISPLAY", trigger: "-PT15M" }], … }

const rsvp = replyEmail(ev!, { address: "sita@contoso.com" }, "ACCEPTED");
// { subject: "Accepted: Sprint review", to: "anil@contoso.com", text, ics,
//   contentType: "text/calendar; method=REPLY; charset=UTF-8", filename: "invite.ics" }
```

## Webmail: invite card and RSVP

**1. Find the calendar part.** Invites arrive as a `text/calendar` part, often with a `method=REQUEST` parameter. The same data may also be attached as `invite.ics`. Pass the part's **bytes** when you have them. Some senders fold lines in the middle of a UTF-8 character, and `parseIcs` repairs that only before the bytes are decoded.

```ts
import { parseMime } from "@lacspace/mime";
import { parseIcs } from "@lacspace/ics";

const mail = parseMime(raw);
const part = mail.attachments.find((a) => /^text\/calendar|application\/ics/i.test(a.contentType));
const cal = part ? parseIcs(part.content) : null;   // Uint8Array or string
```

**2. Show the card.** Use `cal.method` to choose what the card says:

| `method` | Card |
|---|---|
| `REQUEST` | invitation with Accept / Tentative / Decline buttons |
| `CANCEL` | "This event was cancelled" |
| `REPLY` | an attendee's answer, shown in the organizer's inbox |
| `PUBLISH` | a plain event with no RSVP |

The calendar can contain more than one VEVENT. The main event is the one without a `recurrenceId`. Events that share its `uid` and have a `recurrenceId` are changed occurrences: show them as "this occurrence moved to …". Each attendee's current answer is in `ev.attendees[i].partstat`.

```ts
const main = cal.events.find((e) => !e.recurrenceId) ?? cal.events[0];
const when = main.allDay
  ? main.start                                     // "2026-10-20" (DTEND is exclusive)
  : new Date(main.start).toLocaleString("en-GB", { timeZone: userTz });
const me = main.attendees.find((a) => a.address.toLowerCase() === myAddress);
// me?.partstat → "NEEDS-ACTION" | "ACCEPTED" | "DECLINED" | "TENTATIVE"
// main.conference → Meet / Teams / Zoom link for a "Join" button
```

**3. Reply.** `replyEmail()` builds an RFC 5546 §3.2.3 REPLY. It has:
- `METHOD:REPLY` and the invite's `UID` and `SEQUENCE`;
- `RECURRENCE-ID` when you answer a single occurrence;
- the `ORGANIZER`;
- **only** your `ATTENDEE` line, with `PARTSTAT`;
- `DTSTAMP` set to now.

Send it to the organizer:

```ts
import { replyEmail } from "@lacspace/ics";
import { buildMime } from "@lacspace/mime";

const r = replyEmail(main, { name: "Sita Rai", address: myAddress }, "ACCEPTED", { comment: "See you there" });
const message = buildMime({
  from: { name: "Sita Rai", address: myAddress },
  to: r.to!,
  subject: r.subject,
  text: r.text,
  attachments: [{ filename: r.filename, content: r.ics, contentType: r.contentType }],
});
```

**The MIME shape Outlook and Gmail expect.** The calendar part needs this Content-Type, with the `method` parameter. Without `method`, Exchange shows the reply as a plain attachment and does not update the organizer's calendar:

```
Content-Type: text/calendar; method=REPLY; charset=UTF-8
```

Clients that send invites build the message like this:

```
multipart/mixed
├─ multipart/alternative
│  ├─ text/plain                                   (r.text)
│  └─ text/calendar; method=REPLY; charset=UTF-8   (r.ics, inline)
└─ application/ics; name="invite.ics"              (optional copy, same r.ics)
```

Gmail and Outlook also process a `text/calendar; method=…` part that is attached directly under `multipart/mixed`, which is what `buildMime` above writes. Rules for every iTIP message:
- Send the reply **to the organizer's address**.
- Send it from the address that appears in the ATTENDEE line.
- Keep the calendar part UTF-8 and 7bit, quoted-printable or base64. Do not re-wrap its lines, because they are already folded at 75 octets.

**4. Cancel (organizer side).** `buildCancelIcs(invite)` writes `METHOD:CANCEL` and `STATUS:CANCELLED`. It increments `SEQUENCE` and keeps all attendees. Send it to every attendee with `text/calendar; method=CANCEL`.

## Creating an invite

```ts
import { buildIcs } from "@lacspace/ics";

const ics = buildIcs({
  summary: "दशैं भेटघाट — Lacspace HQ",
  start: "2026-10-20T14:00",          // wall time in timeZone
  end: "2026-10-20T15:30",
  timeZone: "Asia/Kathmandu",         // → DTSTART;TZID=Asia/Kathmandu + VTIMEZONE
  location: "Lalitpur, Floor 3",
  description: "Bring tika.\nLunch provided.",
  method: "REQUEST",
  organizer: { name: "Chandan", address: "chandan@lacspace.com" },
  attendees: [{ name: "Ram", address: "ram@example.org" }],   // ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE
  alarms: [{ trigger: 15 }],          // 15 minutes before
});
// send with contentType "text/calendar; method=REQUEST; charset=UTF-8"
```

What `buildIcs` writes:
- CRLF line endings;
- `VERSION:2.0`, `PRODID` (default `-//Lacspace//Lacspace Mail//EN`), `CALSCALE:GREGORIAN`, and `METHOD` when you set one;
- `DTSTAMP` in UTC and escaped TEXT values;
- lines **folded at 75 octets**. The count is in UTF-8 bytes, and a fold never splits a Devanagari character or an emoji.

If `uid` is missing, one is generated as `<uuid>@lacspace.com`. Keep it, because updates and cancellations must reuse it with a higher `sequence`.

The `start` and `end` values can be:
- a `Date`, which is used as that instant;
- `"YYYY-MM-DD"`, which makes an all-day event (DTEND defaults to the next day);
- an ISO string with `Z` or an offset;
- a naive `"YYYY-MM-DDTHH:MM"`, which is read as wall time in `timeZone`, or as UTC when `timeZone` is not set.

Without `timeZone`, times are written in UTC (`…Z`). With `timeZone`, the event gets `TZID` and a `VTIMEZONE` built from `Intl` for the event's year:
- Zones with two transitions a year get yearly `RRULE`s such as `BYMONTH=3;BYDAY=2SU`.
- Zones without DST get a single `STANDARD` block.
- Windows names work too: `timeZone: "Nepal Standard Time"`.

## Time zones

`parseIcs` returns timed values as **UTC ISO strings** and all-day values as `"YYYY-MM-DD"`. The original zone is kept in `startTzid` and `endTzid`. A TZID is resolved in this order:

1. An **IANA** name (`America/New_York`), converted with `Intl.DateTimeFormat`.
2. A **Windows** name used by Outlook and Exchange, through `WINDOWS_TIMEZONES`. The map has about 60 zones, including Nepal, India, Pacific, Eastern, Central, Mountain, W. Europe, Romance, GMT, China, Tokyo, AUS Eastern, Arabian and UTC.
3. A vendor-prefixed IANA path, such as `/mozilla.org/20070129_1/Europe/London`.
4. The calendar's own **VTIMEZONE**. Its STANDARD/DAYLIGHT `TZOFFSETTO` rules are applied, including yearly `RRULE`s with `BYMONTH` + `BYDAY` (`2SU`, `-1SU`) or `BYMONTHDAY` + `BYDAY`, `RDATE`s and `UNTIL`. A zone with no usable rule uses its STANDARD `TZOFFSETTO`.
5. A fixed offset in the name, such as `(UTC+05:45) Kathmandu`. The result ignores DST.
6. `opts.defaultTimeZone`, and UTC if that is not set either.

**Floating times** have neither `Z` nor a TZID. They are read in `defaultTimeZone` when you pass one, and as UTC otherwise. For an invite card, pass the viewer's zone: `parseIcs(text, { defaultTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })`.

**DST edges** follow RFC 5545 §3.3.5:
- A time that does not exist (e.g. 02:30 on spring-forward day in New York) uses the offset from before the change, so it becomes 03:30 EDT.
- A time that happens twice (01:30 on fall-back day) resolves to the **first** occurrence, which is still daylight time.

**DURATION** is used when there is no DTEND. Its days (`P1D`) are calendar days in the event's zone. Its hours, minutes and seconds are exact. An event with neither DTEND nor DURATION ends at its start (timed) or one day later (all-day).

## API

- **`parseIcs(text | bytes, { defaultTimeZone? })`:** returns `{ method, prodId, events, timezones }`. It **never throws**:
  - bad lines are skipped;
  - missing ENDs are tolerated;
  - an event without a UID gets `uid: ""` (no UID is invented);
  - a missing or invalid DTSTART gives `start: ""`.
- **`parseIcsEvent(text | bytes, opts?)`:** returns the first VEVENT, or `null`.
- `IcsEvent` has these fields:
  - `uid`, `sequence`, `summary`, `description`, `location`, `url`;
  - `start`, `end`, `allDay`, `startTzid`, `endTzid`, `duration`;
  - `organizer`, `attendees[]` (each has `name`, `address`, `role`, `partstat`, `rsvp` and `cutype`; the `mailto:` prefix is removed and the name comes from `CN`);
  - `rrule`, `exdate[]`, `rdate[]`, `recurrenceId`;
  - `status`, `transp`, `created`, `lastModified`, `dtstamp`, `categories[]`;
  - `conference`: taken from `X-GOOGLE-CONFERENCE`, Teams/Skype `X-MICROSOFT-*`, `CONFERENCE`, or a Meet/Teams/Zoom link in the location or description;
  - `alarms[]` with `{ action, trigger, description }`;
  - `raw`: every VEVENT property, mapped to its raw values.
- **`buildIcs(event)`:** returns a VCALENDAR string (see above). It throws only when `start` is not a valid date.
- **`buildReplyIcs({ invite, attendee, partstat, comment?, dtstamp? })`:** returns a `METHOD:REPLY` calendar. `invite` can be an `IcsEvent` or the raw ICS text.
- **`buildCancelIcs(invite, { sequence? })`:** returns a `METHOD:CANCEL` calendar with `sequence + 1`.
- **`replyEmail(invite, attendee, partstat, { comment? })`:** returns `{ subject, text, ics, contentType, to, filename }`. The subject is `Accepted:`, `Declined:` or `Tentative:` followed by the event title.
- **Helpers:**
  - `unfold(text | bytes)` and `fold(line)`, which counts in octets;
  - `escapeText` and `unescapeText` (`\\ \; \, \n \N`);
  - `parseDateTime(value, params)`, which returns `{ value, allDay, tzid, floating, epoch }` or `null`;
  - `parseDuration`, `parseContentLine`, `resolveZone`, `buildVTimezone` and `WINDOWS_TIMEZONES`.

## Limitations

- **Recurrence is not expanded.** You get the raw `rrule`, the `exdate`/`rdate` lists in UTC, and override events with `recurrenceId`. To list occurrences, run an RRULE engine over `start` + `rrule` in `startTzid`, remove `exdate` and apply the overrides.
- `RDATE;VALUE=PERIOD` values are returned as raw strings, such as `20261230T090000Z/PT1H`.
- `buildReplyIcs` and `buildCancelIcs` write DTSTART, DTEND and RECURRENCE-ID in UTC. That is valid iTIP, and clients match the occurrence by its instant.
- For a TZID found in no source (IANA, Windows map, VTIMEZONE or offset in the name), the time is read in `defaultTimeZone`, or in UTC if none is set.
- A VTIMEZONE built by `buildIcs` uses the event year's rules. A long recurring series that crosses a future change to a zone's DST law can drift. That is the same limitation every exporter has.
- Only VEVENT is parsed. VTODO and VJOURNAL are ignored, and VFREEBUSY is not supported.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
