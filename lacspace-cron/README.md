# lacspace-cron

**Explain, validate and preview cron expressions in plain English** — and get the **next N run times in any IANA timezone**. Zero runtime dependencies: all the timezone math uses the built-in `Intl` API, so it runs anywhere Node 20+ does.

```bash
npx lacspace-cron "0 9 * * 1-5"
# At 09:00, Monday through Friday.
#   → Mon, 2026-09-07, 09:00:00
#   → Tue, 2026-09-08, 09:00:00
#   → …
```

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
```

| Flag | Description |
| --- | --- |
| `-n, --next <n>` | How many upcoming run times to show (default `5`) |
| `-t, --tz <IANA>` | Timezone for the run times, e.g. `Asia/Kathmandu` (default: host timezone) |
| `--from <ISO>` | Compute runs from this instant instead of *now* |
| `--json` | Emit `{ valid, expression, description, next: [ISO…] }` |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

An invalid expression prints a clear, field-specific error and exits non-zero.

### Examples

```bash
# Explain + next 5 runs (in your local timezone)
lacspace-cron "0 9 * * 1-5"

# Every 15 minutes — show the next 4
lacspace-cron "*/15 * * * *" --next 4

# First of every month, midnight New York time
lacspace-cron "0 0 1 * *" --tz America/New_York

# Machine-readable output for scripts / CI
lacspace-cron "@daily" --json
# {"valid":true,"expression":"@daily","description":"At 00:00.","next":["…"]}
```

## Library

Dual ESM + CJS, fully typed.

```ts
import { explainCron, nextRuns, isValidCron, parseCron, matchesCron } from "lacspace-cron";

explainCron("0 9 * * 1-5");
// "At 09:00, Monday through Friday."

isValidCron("99 * * * *"); // false

// The next three 9am weekday instants, in New York time
nextRuns("0 9 * * 1-5", { tz: "America/New_York", count: 3 });
// [Date, Date, Date]

// Does a specific instant fire? (timezone-aware)
matchesCron("0 0 1 * *", new Date("2026-02-01T00:00:00Z"), "UTC"); // true

// The fully-expanded fields
parseCron("*/15 * * * *").minute; // [0, 15, 30, 45]
```

### API

| Export | Signature |
| --- | --- |
| `parseCron` | `(expr: string) => CronFields` — throws `CronError` on invalid |
| `explainCron` | `(expr: string) => string` |
| `nextRuns` | `(expr: string, opts?: { from?: Date; tz?: string; count?: number }) => Date[]` |
| `isValidCron` | `(expr: string) => boolean` |
| `matchesCron` | `(expr: string, date: Date, tz?: string) => boolean` |
| `CronFields` | typed parse result (expanded value lists per field + flags) |
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

### The day-of-month / day-of-week rule

Following standard cron: if **both** the day-of-month and day-of-week fields are restricted (neither is `*`), a day matches when **either** field matches. If only one is restricted, only that one has to match. `lacspace-cron` implements this OR-rule in both `nextRuns` and `matchesCron`.

## How it works

`parseCron` expands every field into the concrete set of values it matches. To find upcoming runs, `nextRuns` walks forward from the start instant one unit at a time (one minute for 5-field expressions, one second for 6-field), formats each candidate into the target timezone with `Intl.DateTimeFormat`, and checks the broken-out parts against the fields. This makes timezones — including half-hour and 45-minute offsets, and DST transitions — Just Work, with no timezone database to ship. The search is capped at ~5 years; a schedule that never matches (e.g. `0 0 30 2 *`) throws a clear error.

## Limitations (honest)

- **Not supported yet:** the `L` (last), `W` (nearest weekday) and `#` (nth weekday) modifiers — these throw a clear "not supported" error rather than silently misbehaving.
- **`@reboot`** has no wall-clock schedule (it fires at daemon start-up), so it can't be previewed and throws a clear message.
- Because run times are found by iterating, a genuinely impossible expression is only reported as such after the ~5-year search completes.
- Seconds-precision (6-field) previews iterate second-by-second, so very sparse second schedules take longer to compute.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
