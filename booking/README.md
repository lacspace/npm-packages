# @lacspace/booking

Find free meeting slots, write them into an email, and send a calendar invite. It covers three things:
- **`freeSlots`** takes busy times, working hours and a time zone, and returns bookable slots in UTC. It handles DST, offsets like Asia/Kathmandu (+05:45), buffers, minimum notice, holidays and any work week (Nepal's is Sunday to Friday).
- **`proposeText`** turns slots into text such as "Tue 13 Oct, 10:00–10:30 (NPT)", in English or Nepali.
- **`invite`** builds an RFC 5545 / RFC 5546 `METHOD:REQUEST` iCalendar invite.

It has no dependencies (it does not use `@lacspace/ics`) and runs anywhere with `Intl`: Node 18+, Deno, Bun, workers and browsers. Time-zone math uses `Intl.DateTimeFormat`, so no tz database ships with the package.

## Example

```ts
import { freeSlots, proposeText, invite } from "@lacspace/booking";

const slots = freeSlots({
  busy: [{ start: "2026-10-13T05:00:00Z", end: "2026-10-13T06:00:00Z" }],
  from: "2026-10-12T00:00:00Z",
  to: "2026-10-16T00:00:00Z",
  durationMinutes: 30,
  hours: { start: "10:00", end: "17:00", days: [0, 1, 2, 3, 4, 5] }, // Sun–Fri
  timezone: "Asia/Kathmandu",
  buffer: 15,
  minNoticeMinutes: 120,
  holidays: ["2026-10-14"],
});
// [{ start: "2026-10-12T04:15:00.000Z", end: "2026-10-12T04:45:00.000Z" }, …]

proposeText(slots, { timezone: "Asia/Kathmandu" });
// "Mon 12 Oct, 10:00–10:30 (NPT)\nMon 12 Oct, 10:30–11:00 (NPT)\nMon 12 Oct, 11:00–11:30 (NPT)"

proposeText(slots, { timezone: "Asia/Kathmandu", style: "sentence", limit: 2 });
// "Mon 12 Oct 10:00–10:30 or Mon 12 Oct 10:30–11:00 (NPT)"

const { ics, method } = invite(slots[0], {
  title: "Intro call",
  organizer: { name: "Lacspace Sales", email: "sales@lacspace.com" },
  attendees: [{ name: "Sita Sharma", email: "sita@example.com" }],
  url: "https://meet.example.com/abc",
  timezone: "Asia/Kathmandu",
});
// Attach as text/calendar; method=REQUEST
```

## `freeSlots(input)`

| Field | Meaning |
|---|---|
| `busy` | `{ start, end }` ISO strings. They are merged before use, and invalid entries are ignored. |
| `from`, `to` | The search window (ISO). Slots lie entirely inside it. |
| `durationMinutes` | Length of each slot. |
| `hours` | `{ start: "HH:MM", end: "HH:MM", days }`. `days` uses 0 = Sunday. `end` may be `"24:00"`. Hours must not cross midnight. |
| `timezone` | IANA zone for `hours` and `holidays`. |
| `buffer` | Minutes kept free before and after every busy interval. Default 0. |
| `stepMinutes` | Gap between candidate start times, counted from the start of working hours. Defaults to the duration, which gives back-to-back slots. |
| `minNoticeMinutes` | The earliest slot starts at `now + notice`. Default 0. Slots in the past are never returned. |
| `now` | ISO "now". Defaults to the current time. |
| `holidays` | Local dates, `"YYYY-MM-DD"`, with no availability. |
| `limit` | Maximum number of slots. Default 1000. |

The output is `{ start, end }` in UTC ISO form (`toISOString()`), sorted by start time.

**DST:** each day's working hours are converted from local time separately, so `09:00` in New York is 13:00Z in summer and 14:00Z in winter. A wall time that a DST jump skips moves to just after the gap. A wall time that happens twice uses the earlier occurrence.

**Invalid input** returns `[]` and never throws. That covers an unknown time zone, an unparseable `from`, `to` or `now`, `to <= from`, a non-positive duration, and `hours.end <= hours.start`.

## `proposeText(slots, { timezone, limit = 3, locale = "en", style = "list", zoneLabel? })`

- `list` puts one slot per line: `Tue 13 Oct, 10:00–10:30 (NPT)`. `sentence` joins them with "or" (using `Intl.ListFormat`) and puts the zone once at the end.
- Dates and times come from `Intl.DateTimeFormat`, in 24-hour time. A slot that crosses midnight shows both dates.
- **Zone labels:** a short built-in table covers zones that `Intl` would print as `GMT+x` in English (NPT, IST, JST, SGT, GST, CST for Shanghai, HKT). Otherwise the label comes from `Intl` (`EDT`, `BST`, `CEST`, `AEST`…), falling back to `GMT+x`. Pass `zoneLabel` to override it.
- **Nepali:** with `locale: "ne"`, if the runtime's `Intl` supports `ne-NP` you get Nepali weekdays, months and digits (for example `मङ्गल १३ अक्टोबर, १०:००–१०:३०`), and Asia/Kathmandu is labelled `नेपाल समय`. Without Nepali support it falls back to English. `resolveLocale("ne")` tells you which one you'll get. Dates are Gregorian, not Bikram Sambat.
- Returns `""` when no slot is valid or the time zone is unknown.

## `invite(slot, opts)`

It returns `{ ics, method: "REQUEST" }`, a VCALENDAR with:
- `METHOD:REQUEST`, `PRODID`, `VERSION:2.0` and `CALSCALE:GREGORIAN`;
- a single VEVENT containing `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SEQUENCE`, `SUMMARY`, an optional `DESCRIPTION`, `LOCATION` and `URL`, plus `ORGANIZER`, one `ATTENDEE` per attendee (`ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE`), `STATUS:CONFIRMED` and `TRANSP:OPAQUE`.

The output follows these rules:
- **CRLF line endings.** Lines are folded at 75 octets, and a fold never splits a UTF-8 character (checked with Devanagari and emoji).
- **Escaping.** TEXT values escape `\ ; ,` and newlines. `CN` parameter values are quoted when they contain `, ; :`, and DQUOTE and control characters are removed. CR and LF are stripped from emails and UIDs, so header injection isn't possible.
- **Times are UTC** (`20261013T041500Z`), so no `VTIMEZONE` is needed. `timezone` is written as an `X-WR-TIMEZONE` display hint only.
- **UID.** Defaults to a random UUID. Keep the UID and pass it back with a higher `sequence` when you send an update.

Other options are `sequence` (default 0), `now` (DTSTAMP; defaults to the current time) and `prodId`. If the slot is invalid or the organizer email is missing, `ics` is `""`.

## Other exports

`mergeIntervals`, `offsetMinutes(ms, tz)`, `fromLocal(y, m, d, h, min, tz)`, `toLocal(ms, tz)`, `isValidTimeZone`, `zoneLabel`, `resolveLocale`, `foldLine`, `escapeText` and `icsDate`.

## Limits

- **No recurrence.** It doesn't do RRULE, recurring busy blocks, CANCEL/REPLY methods or VALARM.
- **One window a day.** Working hours are a single window per day; lunch breaks can be modelled as busy times. Overnight shifts are not supported.
- **Holidays are your input.** No holiday calendar ships with the package.
- **Accuracy follows the runtime's `Intl` time-zone data.** Very old runtimes may have outdated rules.
- **Search limit.** At most about 400 days are searched in one call.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
