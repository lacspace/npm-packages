import { register, deregister } from "./registry";
import type { FakeTimers } from "./types";

interface Timer {
  id: number;
  callback: AnyCallback;
  args: unknown[];
  /** Absolute epoch time (ms) at which this timer is next due. */
  time: number;
  /** Repeat interval in ms for `setInterval`, else `undefined`. */
  interval: number | undefined;
  /** Monotonic sequence for stable ordering of same-time timers. */
  seq: number;
}

type AnyCallback = (...args: unknown[]) => void;

/** A hard cap so `runAllTimers` on a runaway interval throws instead of hanging. */
const MAX_ITERATIONS = 100_000;

let installed = false;

/**
 * Install deterministic fake timers over the global `setTimeout`,
 * `clearTimeout`, `setInterval`, `clearInterval`, `Date`/`Date.now` and, when
 * present, `setImmediate`/`clearImmediate`.
 *
 * Only one fake clock can be active at a time. All globals are restored exactly
 * on `.restore()`.
 *
 * @param now Initial fake epoch time. Defaults to the real current time.
 */
export function useFakeTimers(now?: number | Date): FakeTimers {
  if (installed) {
    throw new Error("useFakeTimers: fake timers are already installed; restore them first");
  }

  const g = globalThis as Record<string, unknown>;

  // Capture the reals.
  const realSetTimeout = g.setTimeout;
  const realClearTimeout = g.clearTimeout;
  const realSetInterval = g.setInterval;
  const realClearInterval = g.clearInterval;
  const realSetImmediate = g.setImmediate;
  const realClearImmediate = g.clearImmediate;
  const RealDate = g.Date as DateConstructor;
  const hasImmediate = typeof realSetImmediate === "function";

  const timers = new Map<number, Timer>();
  let nextId = 1;
  let seq = 0;
  let clock = now === undefined ? RealDate.now() : +new RealDate(now as number);

  function schedule(
    callback: unknown,
    delay: unknown,
    args: unknown[],
    interval: number | undefined,
  ): number {
    const id = nextId++;
    const ms = Math.max(0, Number(delay) || 0);
    timers.set(id, {
      id,
      callback: typeof callback === "function" ? (callback as AnyCallback) : () => {},
      args,
      time: clock + ms,
      // A repeating timer never advances by 0 (would loop forever); clamp to 1.
      interval: interval === undefined ? undefined : Math.max(1, interval),
      seq: seq++,
    });
    return id;
  }

  /** Earliest timer that is due at or before `limit`, in (time, seq) order. */
  function earliestDue(limit: number): Timer | undefined {
    let best: Timer | undefined;
    for (const t of timers.values()) {
      if (t.time > limit) continue;
      if (!best || t.time < best.time || (t.time === best.time && t.seq < best.seq)) {
        best = t;
      }
    }
    return best;
  }

  // Callers set `clock` to the timer's due time before calling `fire`.
  function fire(t: Timer): void {
    if (t.interval === undefined) {
      timers.delete(t.id);
    } else {
      // Reschedule the repeating timer before running its callback.
      t.time += t.interval;
    }
    t.callback(...t.args);
  }

  const api: FakeTimers = {
    tick(ms: number): void {
      const target = clock + Math.max(0, Number(ms) || 0);
      let iterations = 0;
      for (;;) {
        const due = earliestDue(target);
        if (!due) break;
        if (++iterations > MAX_ITERATIONS) {
          throw new Error("tick: exceeded maximum timer iterations (runaway interval?)");
        }
        clock = due.time;
        fire(due);
      }
      clock = target;
    },

    advanceTimersByTime(ms: number): void {
      api.tick(ms);
    },

    runAllTimers(): void {
      let iterations = 0;
      for (;;) {
        // Drain in due order regardless of how far in the future.
        let next: Timer | undefined;
        for (const t of timers.values()) {
          if (!next || t.time < next.time || (t.time === next.time && t.seq < next.seq)) {
            next = t;
          }
        }
        if (!next) break;
        if (++iterations > MAX_ITERATIONS) {
          throw new Error("runAllTimers: exceeded maximum timer iterations (runaway interval?)");
        }
        clock = next.time;
        fire(next);
      }
    },

    runOnlyPendingTimers(): void {
      // Snapshot the currently-pending timers; do not run ones added meanwhile.
      const snapshot = Array.from(timers.values()).sort(
        (a, b) => a.time - b.time || a.seq - b.seq,
      );
      for (const t of snapshot) {
        if (!timers.has(t.id)) continue;
        clock = Math.max(clock, t.time);
        fire(t);
      }
    },

    setSystemTime(date: number | Date): void {
      clock = typeof date === "number" ? date : +new RealDate(date);
    },

    now(): number {
      return clock;
    },

    restore(): void {
      if (!installed) return;
      g.setTimeout = realSetTimeout;
      g.clearTimeout = realClearTimeout;
      g.setInterval = realSetInterval;
      g.clearInterval = realClearInterval;
      g.Date = RealDate;
      if (hasImmediate) {
        g.setImmediate = realSetImmediate;
        g.clearImmediate = realClearImmediate;
      }
      timers.clear();
      installed = false;
      deregister(entry);
    },
  };

  // A Date subclass whose no-arg form reads the fake clock; everything else
  // behaves like the real Date.
  class FakeDate extends RealDate {
    constructor(...a: unknown[]) {
      if (a.length === 0) {
        super(clock);
      } else {
        // @ts-expect-error forwarding a variadic to the Date constructor
        super(...a);
      }
    }
    static now(): number {
      return clock;
    }
  }

  // Install fakes.
  g.setTimeout = ((cb: unknown, delay?: unknown, ...args: unknown[]) =>
    schedule(cb, delay, args, undefined)) as unknown;
  g.clearTimeout = ((id: unknown) => {
    if (typeof id === "number") timers.delete(id);
  }) as unknown;
  g.setInterval = ((cb: unknown, delay?: unknown, ...args: unknown[]) =>
    schedule(cb, delay, args, Number(delay) || 0)) as unknown;
  g.clearInterval = ((id: unknown) => {
    if (typeof id === "number") timers.delete(id);
  }) as unknown;
  g.Date = FakeDate as unknown as DateConstructor;
  if (hasImmediate) {
    g.setImmediate = ((cb: unknown, ...args: unknown[]) =>
      schedule(cb, 0, args, undefined)) as unknown;
    g.clearImmediate = ((id: unknown) => {
      if (typeof id === "number") timers.delete(id);
    }) as unknown;
  }

  const entry = { restore: () => api.restore() };
  installed = true;
  register(entry);
  return api;
}
