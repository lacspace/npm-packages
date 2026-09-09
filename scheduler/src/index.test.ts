import { test, expect } from "vitest";
import {
  createScheduler,
  parseDuration,
  nextCronRun,
  matchesCron,
  type TimerHandle,
} from "./index";

/* ---- deterministic clock + fake timers (no real time) ---- */

function makeClock(start = 0) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { fn: () => void; at: number }>();

  const setTimer = (fn: () => void, ms: number): TimerHandle => {
    const id = ++seq;
    timers.set(id, { fn, at: now + ms });
    return id;
  };
  const clearTimer = (h: TimerHandle): void => {
    timers.delete(h as number);
  };
  const tick = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      let nextId = -1;
      let nextAt = Infinity;
      for (const [id, t] of timers) {
        if (t.at <= target && t.at < nextAt) {
          nextAt = t.at;
          nextId = id;
        }
      }
      if (nextId === -1) break;
      const t = timers.get(nextId)!;
      timers.delete(nextId);
      now = t.at;
      t.fn();
    }
    now = target;
  };

  return {
    now: () => now,
    setTimer,
    clearTimer,
    tick,
    opts: () => ({ now: () => now, setTimer, clearTimer }),
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/* ============================ parseDuration ============================ */

test("parseDuration handles each unit", () => {
  expect(parseDuration("500ms")).toBe(500);
  expect(parseDuration("30s")).toBe(30_000);
  expect(parseDuration("5m")).toBe(300_000);
  expect(parseDuration("2h")).toBe(7_200_000);
  expect(parseDuration("1d")).toBe(86_400_000);
});

test("parseDuration handles bare numbers and compound tokens", () => {
  expect(parseDuration("250")).toBe(250);
  expect(parseDuration("1h30m")).toBe(5_400_000);
  expect(parseDuration("1m 30s")).toBe(90_000);
});

test("parseDuration rejects garbage", () => {
  expect(() => parseDuration("")).toThrow();
  expect(() => parseDuration("10x")).toThrow();
  expect(() => parseDuration("abc")).toThrow();
});

/* ============================ cron helpers ============================ */

test("nextCronRun for */15 finds the next quarter-hour", () => {
  const from = Date.UTC(2026, 0, 1, 0, 7); // 00:07
  expect(nextCronRun("*/15 * * * *", from, true)).toBe(Date.UTC(2026, 0, 1, 0, 15));
});

test("nextCronRun is strictly after `from` on an exact boundary", () => {
  const from = Date.UTC(2026, 0, 1, 0, 15); // exactly a match
  expect(nextCronRun("*/15 * * * *", from, true)).toBe(Date.UTC(2026, 0, 1, 0, 30));
});

test("nextCronRun for weekday 9am skips the weekend edge", () => {
  // 2026-01-01 is a Thursday; 10:00 is past 09:00 → next weekday 09:00 is Fri.
  const from = Date.UTC(2026, 0, 1, 10, 0);
  expect(nextCronRun("0 9 * * 1-5", from, true)).toBe(Date.UTC(2026, 0, 2, 9, 0));
});

test("nextCronRun rolls a monthly schedule into next month", () => {
  const from = Date.UTC(2026, 0, 15, 0, 0);
  // 00:05 on the 1st
  expect(nextCronRun("5 0 1 * *", from, true)).toBe(Date.UTC(2026, 1, 1, 0, 5));
});

test("matchesCron supports ranges, lists and steps", () => {
  expect(matchesCron("0-30/10 * * * *", new Date(Date.UTC(2026, 0, 1, 0, 20)), true)).toBe(true);
  expect(matchesCron("0-30/10 * * * *", new Date(Date.UTC(2026, 0, 1, 0, 25)), true)).toBe(false);
  expect(matchesCron("0,30 * * * *", new Date(Date.UTC(2026, 0, 1, 5, 30)), true)).toBe(true);
  expect(matchesCron("0,30 * * * *", new Date(Date.UTC(2026, 0, 1, 5, 15)), true)).toBe(false);
});

test("matchesCron treats both 0 and 7 as Sunday", () => {
  const sunday = new Date(Date.UTC(2026, 0, 4, 0, 0)); // 2026-01-04 is a Sunday
  expect(matchesCron("0 0 * * 0", sunday, true)).toBe(true);
  expect(matchesCron("0 0 * * 7", sunday, true)).toBe(true);
});

test("parseCron rejects malformed expressions", () => {
  const c = createScheduler();
  expect(() => c.cron("* * *", () => {})).toThrow();
  expect(() => c.cron("99 * * * *", () => {})).toThrow();
});

/* ============================ every() ============================ */

test("every() fires repeatedly at the interval", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  const job = sched.every(100, () => { n++; });
  expect(n).toBe(0);
  clock.tick(100);
  expect(n).toBe(1);
  clock.tick(300);
  expect(n).toBe(4);
  expect(job.runCount).toBe(4);
});

test("every() accepts a duration string", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  sched.every("1s", () => { n++; });
  clock.tick(2_500);
  expect(n).toBe(2);
});

test("immediate:true runs once at t0 then on the interval", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  const job = sched.every(100, () => { n++; }, { immediate: true });
  expect(n).toBe(1); // fired at creation
  clock.tick(100);
  expect(n).toBe(2);
});

test("nextRun / lastRun / runCount are tracked", () => {
  const clock = makeClock(1_000);
  const sched = createScheduler(clock.opts());
  const job = sched.every(100, () => {});
  expect(job.runCount).toBe(0);
  expect(job.lastRun).toBe(null);
  expect(job.nextRun).toBe(1_100);
  clock.tick(100);
  expect(job.runCount).toBe(1);
  expect(job.lastRun).toBe(1_100);
  expect(job.nextRun).toBe(1_200);
});

/* ============================ maxRuns / stop / start ============================ */

test("maxRuns caps the number of runs and stops the job", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  const job = sched.every(100, () => { n++; }, { maxRuns: 3 });
  clock.tick(10_000);
  expect(n).toBe(3);
  expect(job.isRunning).toBe(false);
  expect(job.nextRun).toBe(null);
});

test("stop() halts a job; start() resumes it", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  const job = sched.every(100, () => { n++; });
  clock.tick(100);
  expect(n).toBe(1);
  job.stop();
  expect(job.isRunning).toBe(false);
  clock.tick(1_000);
  expect(n).toBe(1); // nothing while stopped
  job.start();
  clock.tick(100);
  expect(n).toBe(2);
});

test("scheduler.stop() and start() control every job", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let a = 0;
  let b = 0;
  sched.every(100, () => { a++; });
  sched.every(200, () => { b++; });
  sched.stop();
  clock.tick(1_000);
  expect(a).toBe(0);
  expect(b).toBe(0);
  sched.start();
  clock.tick(200);
  expect(a).toBe(2);
  expect(b).toBe(1);
});

test("list() and clear() manage the job set", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  sched.every(100, () => {});
  sched.every(200, () => {});
  expect(sched.list()).toHaveLength(2);
  let n = 0;
  sched.every(100, () => { n++; });
  sched.clear();
  expect(sched.list()).toHaveLength(0);
  clock.tick(1_000);
  expect(n).toBe(0);
});

/* ============================ one-shots ============================ */

test("after() fires exactly once", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  const job = sched.after(500, () => { n++; });
  clock.tick(499);
  expect(n).toBe(0);
  clock.tick(1);
  expect(n).toBe(1);
  clock.tick(10_000);
  expect(n).toBe(1);
  expect(job.isRunning).toBe(false);
});

test("after() accepts a duration string", () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let n = 0;
  sched.after("2s", () => { n++; });
  clock.tick(2_000);
  expect(n).toBe(1);
});

test("at() fires once at an absolute time", () => {
  const clock = makeClock(1_000);
  const sched = createScheduler(clock.opts());
  let n = 0;
  sched.at(1_500, () => { n++; });
  clock.tick(499);
  expect(n).toBe(0);
  clock.tick(1);
  expect(n).toBe(1);
});

test("at() in the past runs as soon as possible", () => {
  const clock = makeClock(1_000);
  const sched = createScheduler(clock.opts());
  let n = 0;
  sched.at(500, () => { n++; }); // already past
  clock.tick(0);
  expect(n).toBe(1);
});

test("at() accepts a Date", () => {
  const clock = makeClock(0);
  const sched = createScheduler(clock.opts());
  let n = 0;
  sched.at(new Date(2_000), () => { n++; });
  clock.tick(2_000);
  expect(n).toBe(1);
});

/* ============================ cron end-to-end ============================ */

test("cron() executes on schedule and reschedules", () => {
  const clock = makeClock(Date.UTC(2026, 0, 1, 0, 0));
  const sched = createScheduler(clock.opts());
  let n = 0;
  const job = sched.cron("*/15 * * * *", () => { n++; }, { utc: true });
  expect(job.nextRun).toBe(Date.UTC(2026, 0, 1, 0, 15));
  clock.tick(15 * 60_000);
  expect(n).toBe(1);
  clock.tick(15 * 60_000);
  expect(n).toBe(2);
  expect(job.nextRun).toBe(Date.UTC(2026, 0, 1, 0, 45));
});

/* ============================ overlap + errors ============================ */

test("overlap:false skips a tick while a prior async run is in-flight", async () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  const resolvers: Array<() => void> = [];
  let started = 0;
  sched.every(100, () => {
    started++;
    return new Promise<void>((res) => resolvers.push(res));
  });

  clock.tick(100);
  expect(started).toBe(1); // first async run begins
  clock.tick(100);
  expect(started).toBe(1); // still in-flight → skipped
  resolvers.forEach((r) => r());
  await flush();
  clock.tick(100);
  expect(started).toBe(2); // resolved → runs again
});

test("overlap:true allows concurrent async runs", async () => {
  const clock = makeClock();
  const sched = createScheduler(clock.opts());
  let started = 0;
  sched.every(100, () => {
    started++;
    return new Promise<void>(() => {}); // never resolves
  }, { overlap: true });

  clock.tick(300);
  expect(started).toBe(3);
});

test("a throwing task routes to onError and keeps running", () => {
  const clock = makeClock();
  const errors: string[] = [];
  const sched = createScheduler({
    ...clock.opts(),
    onError: (_err, name) => { errors.push(name); },
  });
  const job = sched.every(100, () => { throw new Error("boom"); }, { name: "flaky" });
  clock.tick(300);
  expect(errors).toEqual(["flaky", "flaky", "flaky"]);
  expect(job.isRunning).toBe(true);
  expect(job.runCount).toBe(3);
});

test("a rejecting async task routes to onError", async () => {
  const clock = makeClock();
  const errors: unknown[] = [];
  const sched = createScheduler({
    ...clock.opts(),
    onError: (err) => { errors.push(err); },
  });
  sched.every(100, async () => { throw new Error("async boom"); });
  clock.tick(100);
  await flush();
  expect(errors).toHaveLength(1);
});

test("jobs get default names and honour custom names", () => {
  const sched = createScheduler(makeClock().opts());
  const a = sched.every(100, () => {});
  const b = sched.every(100, () => {}, { name: "cache-refresh" });
  expect(a.name).toBe("job-1");
  expect(b.name).toBe("cache-refresh");
});
