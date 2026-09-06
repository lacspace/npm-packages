# lacspace-cron

**Explain, validate and preview cron expressions in plain English** — and get the **next N run times in any IANA timezone**. Zero runtime dependencies: all the timezone math uses the built-in `Intl` API, so it runs anywhere Node 20+ does.

```bash
npx lacspace-cron "0 9 * * 1-5"
# At 09:00, Monday through Friday.
#   → Mon, 2026-09-07, 09:00:00
#   → Tue, 2026-09-08, 09:00:00
#   → …
```

### New in v0.2.0

- **Advanced day tokens** — `L` / `L-3` / `LW` / `15W` (day-of-month) and `5L` / `5#3` / `FRI#3` (day-of-week).
- **Jenkins-style hashed `H`** — `H`, `H(0-30)`, `H/15`, spread deterministically from a `--seed`.
- **`@every <dur>`** interval schedules — `@every 90s`, `@every 2h30m`.
- **Previous runs** (`--prev`), **windowed runs** (`--from … --to …`) and **`--count-between`**.
- **Relative time** (`--relative`, `describeRelative`), **`.ics` calendar export** (`--ics`), **DST safety warnings**, and a **`compare`** command to find where two schedules overlap.

All of it is backward compatible — every v0.1 flag, command and export is unchanged.

## Install

```bash
# one-off, no install
npx lacspace-cron "*/15 * * * *"

# or globally
npm i -g lacspace-cron

# or as a library
npm i lacspace-cron
```

## CLI

```
lacspace-cron "<expr>" [options]
lacspace-cron compare "<a>" "<b>" [options]
```

| Flag | Description |
| --- | --- |
| `-n, --next <n>` | How many upcoming run times to show (default `5`) |
| `-p, --prev <n>` | Also show the previous *n* run times (before `--from`/now) |
| `-t, --tz <IANA>` | Timezone for the run times, e.g. `Asia/Kathmandu` (default: host timezone) |
| `--from <ISO>` | Compute runs from this instant instead of *now* |
| `--to <ISO>` | With `--from`: list every run in the `[from, to]` window |
| `--count-between` | With `--from`/`--to`: print just the **count** of runs |
| `-r, --relative` | Annotate each run with a relative time (`"in 3 hours"`) |
| `--seed <str>` | Seed for Jenkins-style `H` tokens (default: the expression) |
| `--ics [file.ics]` | Emit an iCalendar file of the next *N* runs (stdout, or a `*.ics` path) |
| `--json` | Machine-readable JSON output |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

An invalid expression prints a clear, field-specific error and exits non-zero. When a schedule lands on a local time that DST **skips** or **repeats**, a warning is printed (and included in `--json` as a `dst` array).

### Examples

```bash
# Explain + next 5 runs, each with a relative time
lacspace-cron "0 9 * * 1-5" --relative

# Last day of the month; last Friday; nearest weekday to the 15th
lacspace-cron "0 0 L * *"
lacspace-cron "0 9 * * 5L"
lacspace-cron "0 9 15W * *"

# Jenkins-style hashed schedule, stable per job name
lacspace-cron "H H(0-6) * * *" --seed billing-nightly

# Interval schedule (Go / robfig style)
lacspace-cron "@every 90s" --next 4

# How many 03:00 runs in January? (and the full list without --count-between)
lacspace-cron "0 3 * * *" --from 2026-01-01 --to 2026-02-01 --count-between

# Previous 3 + next 3 runs
lacspace-cron "0 9 * * 1-5" --prev 3 --next 3

# Export the next 10 runs to a calendar file you can import
lacspace-cron "0 9 * * 1-5" --next 10 --ics standup.ics

# Do two schedules ever fire at the same minute?
lacspace-cron compare "0 * * * *" "*/15 * * * *"

# Machine-readable output for scripts / CI
lacspace-cron "@daily" --json
# {"valid":true,"expression":"@daily","description":"At 00:00.","next":["…"]}
```

## Library

Dual ESM + CJS, fully typed.

```ts
import {
  explainCron, nextRuns, prevRuns, runsBetween, countBetween,
  overlaps, dstWarnings, describeRelative, toICS,
  isValidCron, isValidSchedule, parseCron, parseSchedule, parseDuration, matchesCron,
} from "lacspace-cron";

explainCron("0 9 * * 1-5");                 // "At 09:00, Monday through Friday."
explainCron("@every 2h30m");                // "Every 2 hours and 30 minutes."
explainCron("0 9 * * 5L");                  // "At 09:00, the last Friday of the month."

isValidCron("99 * * * *");                  // false
isValidSchedule("@every 5m");               // true

// Next / previous 3 nine-am weekday instants, in New York time
nextRuns("0 9 * * 1-5", { tz: "America/New_York", count: 3 });   // [Date, Date, Date]
prevRuns("0 9 * * 1-5", { tz: "America/New_York", count: 3 });   // most-recent first

// Every run in a window (and just the count)
runsBetween("0 3 * * *", new Date("2026-01-01"), new Date("2026-02-01"), { tz: "UTC" });
countBetween("0 3 * * *", new Date("2026-01-01"), new Date("2026-02-01"), { tz: "UTC" }); // 31

// Do two schedules ever fire together?
overlaps("0 * * * *", "*/15 * * * *", { tz: "UTC" });
// { overlaps: true, next: Date, checked: 1 }

// Warn about DST-skipped / -repeated local times
dstWarnings("30 2 * * *", { tz: "America/New_York" });
// [{ kind: "skipped", local: "2026-03-08 02:30" }, …]

describeRelative(nextRuns("0 9 * * 1-5")[0]);   // "in 14 hours"
toICS("0 9 * * 1-5", { count: 5 });             // a valid .ics string

matchesCron("0 0 1 * *", new Date("2026-02-01T00:00:00Z"), "UTC");   // true
parseCron("*/15 * * * *").minute;                                    // [0, 15, 30, 45]
parseDuration("2h30m");                                              // 9000000
```

### API

| Export | Signature |
| --- | --- |
| `parseCron` | `(expr, opts?: { seed? }) => CronFields` — throws `CronError` on invalid |
| `parseSchedule` | `(expr, opts?: { seed? }) => Schedule` — cron **or** `@every` (discriminated by `.kind`) |
| `parseDuration` | `(str) => number` — `"2h30m"` → milliseconds |
| `explainCron` | `(expr, opts?: { seed? }) => string` |
| `nextRuns` | `(expr, opts?: { from?; tz?; count?; seed? }) => Date[]` |
| `prevRuns` | `(expr, opts?: { from?; tz?; count?; seed? }) => Date[]` — most-recent first |
| `runsBetween` | `(expr, from, to, opts?: { tz?; seed?; limit? }) => Date[]` |
| `countBetween` | `(expr, from, to, opts?) => number` |
| `overlaps` | `(a, b, opts?: { from?; tz?; withinDays?; seed? }) => { overlaps; next; checked }` |
| `dstWarnings` | `(expr, opts?: { from?; tz?; days?; seed? }) => { kind: "skipped" \| "repeated"; local }[]` |
| `describeRelative` | `(date, from?) => string` |
| `toICS` | `(expr, opts?: { from?; tz?; count?; seed?; title?; durationMinutes? }) => string` |
| `isValidCron` / `isValidSchedule` | `(expr, opts?) => boolean` |
| `matchesCron` | `(expr, date, tz?) => boolean` |
| `CronFields` / `EveryFields` / `Schedule` / `DomSpecial` / `DowSpecial` | typed parse results |
| `CronError` | error class thrown for invalid / unsupported input |

Returned `Date`s are absolute instants — format them in the same `tz` you requested.

## Supported syntax

Standard **5-field** cron:

```
┌───────── minute        (0-59)
│ ┌─────── hour          (0-23)
│ │ ┌───── day-of-month  (1-31)
│ │ │ ┌─── month         (1-12 or JAN-DEC)
│ │ │ │ ┌─ day-of-week   (0-6 or SUN-SAT, 7 = Sunday)
│ │ │ │ │
* * * * *
```

…and optional **6-field** cron with a leading **seconds** field (`* * * * * *`).

Per field: `*`, ranges `a-b`, steps `*/n` and `a-b/n` (and `a/n`), lists `a,b,c`, month names `JAN..DEC`, weekday names `SUN..SAT`, and `?` (treated as `*`).

**Macros:** `@yearly`/`@annually`, `@monthly`, `@weekly`, `@daily`/`@midnight`, `@hourly`.

**Advanced day tokens** (v0.2.0):

| Token | Field | Meaning |
| --- | --- | --- |
| `L` | day-of-month | The **last** day of the month |
| `L-3` | day-of-month | **3 days before** the last day |
| `LW` | day-of-month | The last **weekday** (Mon–Fri) of the month |
| `15W` | day-of-month | The **nearest weekday** to the 15th (no month-hop) |
| `5L` / `FRIL` | day-of-week | The **last Friday** of the month |
| `5#3` / `FRI#3` | day-of-week | The **3rd Friday** of the month |

Day-of-week numbers are `0–6` (0 = Sunday), so `5` = Friday — the same numbering as the rest of the field (names like `FRI` work too).

**Jenkins-style hashed `H`** (v0.2.0): `H`, `H(0-30)`, `H/15` (and `H(0-30)/10`). Each `H` resolves to a **deterministic** value derived from a seed (the expression by default, or `--seed`/`{ seed }`), salted per field — so load is spread out but stays identical on every run. Great for "run once an hour, but not everything on the hour".

**Interval schedules** (v0.2.0): `@every <duration>` where duration is any combination of `d`, `h`, `m`, `s`, `ms` — e.g. `@every 90s`, `@every 5m`, `@every 2h30m`, `@every 1d12h`. Runs are computed by adding the interval to the start instant.

### The day-of-month / day-of-week rule

Following standard cron: if **both** the day-of-month and day-of-week fields are restricted (neither is `*`), a day matches when **either** field matches. If only one is restricted, only that one has to match. `lacspace-cron` implements this OR-rule in both `nextRuns` and `matchesCron`.

## How it works

`parseCron` expands every field into the concrete set of values it matches. To find upcoming runs, `nextRuns` walks forward from the start instant one unit at a time (one minute for 5-field expressions, one second for 6-field), formats each candidate into the target timezone with `Intl.DateTimeFormat`, and checks the broken-out parts against the fields. This makes timezones — including half-hour and 45-minute offsets, and DST transitions — Just Work, with no timezone database to ship. The search is capped at ~5 years; a schedule that never matches (e.g. `0 0 30 2 *`) throws a clear error.

## Limitations (honest)

- **`@reboot`** has no wall-clock schedule (it fires at daemon start-up), so it can't be previewed and throws a clear message.
- **`@every`** schedules are anchored at the `from` instant (they have no absolute wall-clock grid); `matchesCron` on an `@every` schedule aligns to the Unix epoch, and `dstWarnings` doesn't apply to them.
- **DST warnings** cover schedules with concrete hour/minute slots; they inspect the 12 months from `from` (tunable via `days`). The `repeated` case fires on the **first** of the two occurrences, and `skipped` runs are dropped — matching how real cron daemons behave.
- **`overlaps`** searches a bounded window (default 366 days) minute-by-minute — second-by-second if either side needs sub-minute precision — and caps at ~5M checks, so "no overlap" means "none found in the window", not a mathematical proof.
- Because run times are found by iterating, a genuinely impossible expression is only reported as such after the ~5-year search completes.
- Seconds-precision (6-field) previews iterate second-by-second, so very sparse second schedules take longer to compute.
- The `W` token never hops across a month boundary (standard behaviour): `1W` on a Saturday-1st fires the following Monday, not the previous Friday.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
