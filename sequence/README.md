# @lacspace/sequence

Multi-step follow-up email sequences ("send the intro, bump it in 2 days if they haven't replied, last nudge 3 days later") as a **pure state machine**. It does no I/O, starts no timers and stores nothing. You keep enrollments in your own database, call `due()` from a scheduler (every minute, say), send what it tells you to send, and record the result with `advance()`.

- Delays in days, hours, minutes and business days, counted from the previous step.
- Send windows (days of week, `"09:00"`–`"17:00"` or fractional hours, holidays) in the **recipient's** IANA timezone. DST-correct, using `Intl.DateTimeFormat` only. Odd offsets such as Asia/Kathmandu (+05:45) work.
- Stops on reply, bounce, unsubscribe, complaint, click, meeting booked or manual stop (you choose which).
- Step conditions: `no_reply`, `opened`, `no_open`, `clicked`, `no_click`.
- Pause and resume, retry after a failed send, stop after 3 failures in a row.
- Reply threading: a step can ask for the previous message's id.
- Deterministic jitter, seeded by (enrollment id, step id). Never `Math.random`.
- Per-hour and per-day send budgets in `due()`.
- Enrollments are plain JSON (ISO date strings), so they go straight into Mongo or anywhere else.

Zero dependencies. Works in Node 18+, browsers, Deno, Bun and edge runtimes.

```sh
npm i @lacspace/sequence
```

## Example

```ts
import { advance, due, validateSequence, type Enrollment, type Sequence } from "@lacspace/sequence";

const followUp: Sequence = {
  id: "demo-follow-up",
  steps: [
    { id: "intro", templateId: "tpl_intro" },
    { id: "bump", delay: { businessDays: 2 }, templateId: "tpl_bump", threadWith: "previous" },
    { id: "last", delay: { days: 4 }, templateId: "tpl_last", condition: "no_open" },
  ],
  window: { start: "09:00", end: "17:00", weekdaysOnly: true },
  // default stopOn: reply, bounce, unsubscribe, complaint, manual
};

validateSequence(followUp); // { ok: true, errors: [] }

let enrollment: Enrollment = {
  id: "enr_1",
  sequenceId: "demo-follow-up",
  contact: "sam@example.com",
  timezone: "America/New_York",
  enrolledAt: new Date().toISOString(),
  history: [],
  events: [],
};

// Every minute, in your scheduler:
const now = new Date();
const tick = due([enrollment], { [followUp.id]: followUp }, now, {
  perHour: 50, perDay: 400, sentThisHour: 0, sentToday: 0,
});

for (const { enrollmentId, action } of tick.send) {
  // send with action.step.templateId; set In-Reply-To/References from action.threadWith
  enrollment = advance(enrollment, { type: "sent", stepId: action.step.id, messageId: "<id@mail>", at: now.toISOString() });
  // on error: advance(enrollment, { type: "failed", stepId: action.step.id, error: String(err), at: now.toISOString() })
}
for (const { stepId } of tick.skip) {
  enrollment = advance(enrollment, { type: "skipped", stepId, at: now.toISOString() });
}
for (const { enrollmentId, reason } of tick.stop) {
  // set the enrollment's status yourself, e.g. "replied", "done", "unsubscribed"
}

// From your inbound mail / tracking webhooks:
enrollment = advance(enrollment, { type: "reply", at: new Date().toISOString() });
```

## How it decides

`nextAction()` checks, in this order:

1. **Status.** `replied`, `bounced`, `unsubscribed`, `done` or `failed` → `stop` (`done` maps to `"completed"`).
2. **Stop events.** The first event whose trigger is in `stopOn` → `stop`. Mapping: reply → `replied`, bounce → `bounced`, unsubscribe → `unsubscribed`, complaint → `complained`, click → `clicked`, meeting_booked → `meeting_booked`, manual_stop → `manual`.
3. **Pause.** The latest `pause`/`resume` event decides. With no such event, status `paused` → `paused`.
4. **Failures.** 3 `failed` history entries in a row → `stop` `"failed"`.
5. **Next step.** The step after the furthest step with a `sent` or `skipped` history entry. None left → `stop` `"completed"`.
6. **Time.** Previous step's send (or skip) time, or `enrolledAt` for step 0, plus the delay, then moved into the window. After a failure, the retry is not before the failure + `retryMinutes` (default 10). If that time is later than `now` → `wait` with the exact `until` and a reason (`"delay"`, `"window"` or `"retry"`).
7. **Condition.** Checked only once the step is due, against events at or after the previous send (or `enrolledAt`). Not met → `skip` with a reason (`replied`, `not_opened`, `opened`, `not_clicked`, `clicked`). A click also counts as an open.
8. Otherwise → `send` with `at` (the scheduled time, ≤ now) and, for `threadWith: "previous"`, the previous sent `messageId`.

**Timezone** is the first valid one of: `enrollment.timezone` → `window.timezone` → `sequence.timezone` → `"UTC"`.

**Delays.** `businessDays` and `days` move the local calendar date and keep the local time of day, so a DST switch does not shift a "same time, 2 days later" send. `hours` and `minutes` are elapsed time. `delayHours` is added to `delay.hours`. Business days are the window's `days` if set, otherwise Mon–Fri, minus the window's holidays.

**Windows.** `start`/`end` (`"HH:MM"`, end exclusive, `"24:00"` allowed) win over `startHour`/`endHour` (fractional, `9.5` = 09:30). `days` (0 = Sunday) overrides `weekdaysOnly`. `holidays` are `"YYYY-MM-DD"` in the recipient's local calendar. With no window, any time is allowed. A start time that falls in a DST gap resolves to the same wall time after the gap (02:30 on a US spring-forward day becomes 03:30).

## Nepal Sun–Fri example

Nepal's working week is Sunday to Friday, and Kathmandu is UTC+05:45.

```ts
import { previewTimeline, type Sequence } from "@lacspace/sequence";

const nepal: Sequence = {
  id: "np-follow-up",
  steps: [
    { id: "namaste" },
    { id: "follow-up", delay: { businessDays: 1 } },
  ],
  window: {
    days: [0, 1, 2, 3, 4, 5],          // Sun–Fri
    start: "10:00",
    end: "17:00",
    holidays: ["2026-10-20", "2026-10-21"],
    timezone: "Asia/Kathmandu",
  },
};

previewTimeline(nepal, { start: "2026-10-09T05:00:00Z" }); // Friday 10:45 NPT
// [
//   { stepId: "namaste",   at: "2026-10-09T05:00:00.000Z" }, // Fri 10:45 NPT
//   { stepId: "follow-up", at: "2026-10-11T05:00:00.000Z" }, // Sun 10:45 NPT (Saturday skipped)
// ]
```

## API

- **`nextAction(sequence, enrollment, now, opts?)`** → `Action`: `send` | `wait` | `skip` | `stop` | `paused` (see above). Options: `jitterMinutes` (spread sends by 0 up to that many minutes, whole seconds, seeded by enrollment id + step id; dropped if it would push the send past the end of that window session) and `retryMinutes` (default 10).
- **`advance(enrollment, event)`** → a new `Enrollment`. Never mutates its input. Takes `{ type: "sent", stepId, messageId?, at }`, `{ type: "skipped", stepId, at }`, `{ type: "failed", stepId, error, at }`, or a contact event (`reply`, `open`, `click`, `bounce`, `unsubscribe`, `complaint`, `meeting_booked`, `manual_stop`, `pause`, `resume`, with optional `stepId`). It rewrites every date as an ISO string. It changes `status` only for `pause` (→ `paused`), `resume` (`paused` → `active`) and a third failure in a row (→ `failed`). Stop statuses such as `replied` are yours to set from the `stop` action, because they depend on the sequence's `stopOn`.
- **`nextRun(sequence, enrollment, now, opts?)`** → the ISO time of the next send, or `null` when stopped, paused or done. Steps whose condition already fails at `now` are skipped over. A step that is still waiting may later be skipped when its condition is checked.
- **`due(enrollments, sequences, now, budget, opts?)`** → `{ send, stop, skip, errors }`.
  - `send` is sorted by `at`, oldest first, and cut to `max(0, min(perHour − sentThisHour, perDay − sentToday))`.
  - `stop` and `skip` let you update those enrollments in the same tick. An enrollment whose `sequenceId` is missing or unknown goes into `stop` with reason `"unknown_sequence"`.
  - Enrollments already in a stopped status (`replied`, `bounced`, `unsubscribed`, `done`, `failed`) are left out.
  - `errors` lists enrollments that threw (an invalid date or window) instead of failing the whole tick.
  - One action per enrollment per tick. After you record a skip, the next step comes up on the next tick.
- **`previewTimeline(sequence, { start, timezone? })`** → `[{ stepId, at }]`, assuming every step sends at its scheduled time and nothing stops the sequence. No jitter.
- **`scheduleStep(after, delay, window, tz)`** → ISO string: `after` + delay, moved into the window. An unknown `tz` falls back to UTC.
- **`validateSequence(seq)`** → `{ ok, errors }`. Never throws. Flags: missing id, empty steps, missing or duplicate step ids, negative or non-numeric delays, fractional `businessDays`, unknown conditions, `threadWith` or `stopOn` values, unknown timezones, malformed `"HH:MM"` times, hours outside 0–24, `end <= start`, empty or out-of-range `days`, and malformed holidays.
- **Helpers:** `isValidTimeZone`, `zonedParts`, `zonedToUtc`, `offsetMs`, `normalizeWindow`, `parseClock`, `jitterMs`, `hash32`, `isTerminalStatus`, `DEFAULT_STOP_ON`, `MAX_CONSECUTIVE_FAILURES`.
- **Types:** `Sequence`, `Step`, `Delay`, `Window` (alias `SendWindow`), `Enrollment`, `HistoryEntry`, `EnrollmentEvent`, `Action` and its members, `AdvanceEvent`, `Budget`, `DueResult`, `NextActionOptions`, `StopReason`, `StopTrigger`, `TimeInput`.

## Limits

- It doesn't send email, track opens or detect replies. You feed those in as events.
- It doesn't store anything or count your budget. You pass `sentThisHour` and `sentToday` in.
- Windows can't cross midnight: `22:00`–`06:00` is rejected (`validateSequence` reports it, and `nextAction`/`scheduleStep` throw a `RangeError`).
- One window per sequence, not per step.
- Events are matched by time, not by `stepId`. A condition looks at every event since the previous send.
- Stop events count whenever they happened, even before `enrolledAt`.
- After a long pause, a step that became due during the pause is sent as soon as you resume (inside the window). The delay isn't restarted.
- Timezone data comes from the runtime's `Intl`. Old runtimes with stale tz data give stale answers. An unknown enrollment timezone falls through to the next one in the chain without an error. Use `isValidTimeZone` to check it on input.
- Scheduling looks at most 800 days ahead for an allowed window slot, then throws. `due()` reports that enrollment in `errors`.
- If you edit a sequence's steps while people are enrolled, progress follows step ids. Steps inserted before the furthest completed step are not sent.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
