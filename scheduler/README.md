# @lacspace/scheduler

A tiny **in-process job scheduler** for Node and the browser. It doesn't just *explain* cron — it actually **runs** your callbacks: on a fixed interval, a standard 5-field cron schedule, or at a specific time. With start/stop, overlap protection, jitter and per-job error isolation. Zero dependencies, isomorphic, TypeScript-first.

It self-reschedules from the clock on every tick (never `setInterval`), so cron drift is corrected each run and slow async tasks never stack up on top of each other.

```bash
npm i @lacspace/scheduler
```

## Quick start

```ts
import { createScheduler } from "@lacspace/scheduler";

const sched = createScheduler({
  onError: (err, name) => console.error(`job ${name} failed`, err),
});

// every 30 seconds — ms or a duration string ("500ms", "30s", "5m", "2h", "1d")
sched.every("30s", () => refreshCache());

// once, 5 minutes from now
sched.after("5m", () => cleanup());

// at an absolute time
sched.at(new Date("2026-12-31T23:59:00Z"), () => rollOver());
```

Jobs are **live the moment you create them**. Use `job.stop()` / `job.start()` (or `sched.stop()` / `sched.start()`) to pause and resume, and `sched.clear()` to stop and drop everything.

## Cron

Standard 5-field cron — `minute hour day-of-month month day-of-week` — with `*`, lists (`,`), ranges (`a-b`), and steps (`*/n`, `a-b/n`). Day-of-week is `0`–`6` (`0` or `7` = Sunday).

```ts
sched.cron("*/15 * * * *", () => poll());       // every 15 minutes
sched.cron("0 9 * * 1-5", () => sendDigest());  // 09:00 on weekdays
sched.cron("0 0 1 * *", () => bill(), { utc: true }); // midnight on the 1st, UTC
```

Following Vixie-cron semantics, when **both** day-of-month and day-of-week are restricted, a day matches if **either** field matches.

## One-shots

```ts
sched.after(1000, () => {});          // 1s from now
sched.after("2h", () => {});          // duration string
sched.at(Date.now() + 5000, () => {}); // absolute epoch ms
sched.at(pastDate, () => {});          // past/now → runs as soon as possible
```

## Options

Per-job options apply to any job type:

```ts
sched.every("1m", task, {
  name: "cache-refresh", // for logs + onError
  immediate: true,       // also run once right now (every() only)
  overlap: false,        // default: skip a tick if the previous async run is still in-flight
  jitter: 500,           // add 0–500ms of random delay per run (thundering-herd relief)
  maxRuns: 100,          // stop after N runs
});
```

- **overlap** — with async tasks, if the previous run's promise hasn't settled and `overlap` is false, the tick is **skipped** (the job still reschedules) so two copies never run at once. Set `true` to allow concurrency.
- **jitter** — spreads many instances/jobs so they don't all fire on the same millisecond.
- **error isolation** — if a task throws or rejects, it's routed to `onError(err, name)` and the job **keeps running**.

## Testing with injected timers

The clock and timers are injectable, so tests need **no real time** and never flake:

```ts
import { createScheduler } from "@lacspace/scheduler";

let now = 0;
const timers: Array<{ fn: () => void; at: number }> = [];

const sched = createScheduler({
  now: () => now,
  setTimer: (fn, ms) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
  clearTimer: (h) => { const i = timers.indexOf(h as any); if (i >= 0) timers.splice(i, 1); },
});

function tick(ms: number) {              // advance virtual time, fire due timers
  const target = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers.splice(timers.indexOf(due), 1);
    now = due.at;
    due.fn();
  }
  now = target;
}

let n = 0;
sched.every(100, () => { n++; });
tick(300);
// n === 3
```

The pure schedule helpers are exported too, so you can unit-test timing logic without any scheduler at all:

```ts
import { parseDuration, nextCronRun, matchesCron } from "@lacspace/scheduler";

parseDuration("1h30m");                                   // 5400000
nextCronRun("0 9 * * 1-5", Date.now(), true);             // epoch ms of the next weekday 09:00 (UTC)
matchesCron("*/15 * * * *", new Date());                  // boolean
```

## API

| Export | What |
|---|---|
| `createScheduler(options?)` | Build a `Scheduler`. Options: `onError`, `now`, `setTimer`, `clearTimer`. |
| `sched.every(interval, task, opts?)` | Repeat every N ms / duration string. |
| `sched.cron(expr, task, opts?)` | Run on a 5-field cron schedule (`opts.utc` for UTC). |
| `sched.after(delay, task, opts?)` | One-shot after a delay. |
| `sched.at(when, task, opts?)` | One-shot at a `Date` or epoch ms. |
| `sched.list()` / `start()` / `stop()` / `clear()` | Enumerate / start all / stop all / stop + drop all. |
| `Job` | `.name`, `.start()`, `.stop()`, `.isRunning`, `.runCount`, `.lastRun`, `.nextRun`. |
| `parseDuration(s)` | Duration string → ms. |
| `nextCronRun(expr, from, utc?)` | Epoch ms of the next match strictly after `from`. |
| `matchesCron(expr, date, utc?)` | Does `date` satisfy `expr`? |

## Why

- **Runs jobs, not previews** — a real executor, not a cron explainer.
- **Zero dependencies** — nothing to audit, tiny install.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Drift-corrected** — reschedules from the clock each tick, so cron stays on time.
- **Safe by default** — overlap protection and error isolation built in.
- **Testable** — inject a fake clock and timers; no `vi.useFakeTimers()` gymnastics required.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.
