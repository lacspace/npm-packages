/**
 * @lacspace/scheduler
 *
 * A tiny in-process job scheduler for Node and the browser. Unlike a cron
 * *previewer*, this one actually RUNS your callbacks — on a fixed interval,
 * a standard 5-field cron schedule, or at a specific time — with start/stop,
 * overlap protection, jitter and per-job error isolation. Zero dependencies,
 * isomorphic, and fully testable: the clock and timers are injectable, so
 * unit tests need no real time.
 *
 * It self-reschedules from `now()` on every tick (never `setInterval`), so
 * cron drift is corrected each run and long-running async tasks never stack
 * up on top of each other.
 *
 * @example
 * import { createScheduler } from "@lacspace/scheduler";
 *
 * const sched = createScheduler({
 *   onError: (err, name) => console.error(`job ${name} failed`, err),
 * });
 *
 * // every 30 seconds (duration string or ms)
 * sched.every("30s", () => refreshCache());
 *
 * // weekdays at 09:00, no concurrent runs
 * sched.cron("0 9 * * 1-5", async () => sendDigest(), { overlap: false });
 *
 * // one-shot, 5 minutes from now
 * sched.after("5m", () => cleanup());
 *
 * sched.stop(); // halt everything; sched.start() resumes
 */

/* ============================ duration ============================ */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_TOKEN = /(-?\d*\.?\d+)\s*(ms|s|m|h|d)?/giy;

/**
 * Parse a human duration string into milliseconds. Accepts single or compound
 * tokens with units `ms`, `s`, `m`, `h`, `d` — e.g. `"500ms"`, `"30s"`,
 * `"5m"`, `"2h"`, `"1d"`, `"1h30m"`. A bare number is treated as milliseconds.
 *
 * @throws if the string is empty or contains an unrecognised token.
 */
export function parseDuration(s: string): number {
  const str = s.trim();
  if (str === "") throw new Error("parseDuration: empty duration string");

  // A bare number is milliseconds.
  if (/^-?\d*\.?\d+$/.test(str)) return Number(str);

  DURATION_TOKEN.lastIndex = 0;
  let total = 0;
  let matched = false;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = DURATION_TOKEN.exec(str)) !== null) {
    matched = true;
    const value = Number(m[1]);
    const unit = (m[2] ?? "ms").toLowerCase();
    const scale = UNIT_MS[unit];
    if (scale === undefined) throw new Error(`parseDuration: unknown unit "${unit}"`);
    total += value * scale;
    pos = DURATION_TOKEN.lastIndex;
    // skip any whitespace between tokens
    while (pos < str.length && /\s/.test(str.charAt(pos))) pos++;
    DURATION_TOKEN.lastIndex = pos;
  }
  if (!matched || pos !== str.length) {
    throw new Error(`parseDuration: could not parse "${s}"`);
  }
  return total;
}

function toMs(v: number | string): number {
  return typeof v === "number" ? v : parseDuration(v);
}

/* ============================== cron ============================== */

interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const set = new Set<number>();
  for (const part of field.split(",")) {
    const token = part.trim();
    if (token === "") throw new Error(`cron: empty field segment in "${field}"`);

    let range = token;
    let step = 1;
    const slash = token.indexOf("/");
    if (slash !== -1) {
      range = token.slice(0, slash);
      step = parseInt(token.slice(slash + 1), 10);
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`cron: invalid step in "${token}"`);
      }
    }

    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
    } else {
      const dash = range.indexOf("-");
      if (dash > 0) {
        lo = parseInt(range.slice(0, dash), 10);
        hi = parseInt(range.slice(dash + 1), 10);
      } else {
        lo = parseInt(range, 10);
        hi = lo;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`cron: value out of range [${min}-${max}] in "${token}"`);
    }
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron: expected 5 fields (min hour dom month dow), got ${parts.length} in "${expr}"`);
  }
  const [minF, hourF, domF, monthF, dowF] = parts as [string, string, string, string, string];
  const dow = parseField(dowF, 0, 7);
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0); // 7 and 0 both mean Sunday
  }
  return {
    minute: parseField(minF, 0, 59),
    hour: parseField(hourF, 0, 23),
    dom: parseField(domF, 1, 31),
    month: parseField(monthF, 1, 12),
    dow,
    domStar: domF.trim() === "*",
    dowStar: dowF.trim() === "*",
  };
}

interface DateFields {
  minute: number;
  hour: number;
  dom: number;
  month: number;
  dow: number;
}

function fieldsOf(ms: number, utc: boolean): DateFields {
  const d = new Date(ms);
  return utc
    ? {
        minute: d.getUTCMinutes(),
        hour: d.getUTCHours(),
        dom: d.getUTCDate(),
        month: d.getUTCMonth() + 1,
        dow: d.getUTCDay(),
      }
    : {
        minute: d.getMinutes(),
        hour: d.getHours(),
        dom: d.getDate(),
        month: d.getMonth() + 1,
        dow: d.getDay(),
      };
}

function matchSpec(spec: CronSpec, f: DateFields): boolean {
  if (!spec.minute.has(f.minute)) return false;
  if (!spec.hour.has(f.hour)) return false;
  if (!spec.month.has(f.month)) return false;

  const domMatch = spec.dom.has(f.dom);
  const dowMatch = spec.dow.has(f.dow);
  // Vixie-cron rule: if BOTH day fields are restricted, a day matches when
  // EITHER matches; otherwise both must match (one of them being `*`).
  if (!spec.domStar && !spec.dowStar) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

/** True if `date` satisfies the 5-field cron `expr`. */
export function matchesCron(expr: string, date: Date, utc = false): boolean {
  return matchSpec(parseCron(expr), fieldsOf(date.getTime(), utc));
}

const CRON_SEARCH_LIMIT = 5 * 366 * 24 * 60; // ~5 years of minutes

/**
 * Epoch ms of the next time `expr` matches, strictly after `from`.
 * @throws if no match is found within ~5 years (e.g. an impossible schedule).
 */
export function nextCronRun(expr: string, from: number, utc = false): number {
  const spec = parseCron(expr);
  // Snap to the start of the current minute, then step forward one minute so
  // the result is always strictly after `from`.
  const d = new Date(from);
  if (utc) d.setUTCSeconds(0, 0);
  else d.setSeconds(0, 0);
  let ms = d.getTime() + 60_000;

  for (let i = 0; i < CRON_SEARCH_LIMIT; i++) {
    if (matchSpec(spec, fieldsOf(ms, utc))) return ms;
    ms += 60_000;
  }
  throw new Error(`nextCronRun: no matching time within range for "${expr}"`);
}

/* ============================ scheduler ============================ */

/** Opaque timer handle returned by `setTimer` and passed back to `clearTimer`. */
export type TimerHandle = unknown;

export interface SchedulerOptions {
  /** Called when a task throws or rejects. The job keeps running regardless. */
  onError?: (error: unknown, jobName: string) => void;
  /** Clock override (epoch ms). Default `Date.now`. */
  now?: () => number;
  /** Timer factory. Default `globalThis.setTimeout`. */
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  /** Timer canceller. Default `globalThis.clearTimeout`. */
  clearTimer?: (h: TimerHandle) => void;
}

export interface JobOptions {
  /** Human name (defaults to `job-N`). */
  name?: string;
  /** For `every()`: also run once immediately when started. */
  immediate?: boolean;
  /** Allow a new run while a previous async run is still in-flight. Default false. */
  overlap?: boolean;
  /** Random 0..jitter ms added to each scheduled delay. */
  jitter?: number;
  /** Stop the job after this many runs. */
  maxRuns?: number;
}

export interface Job {
  name: string;
  /** Begin (or resume) scheduling this job. Idempotent. */
  start(): void;
  /** Cancel the pending timer and stop scheduling. Idempotent. */
  stop(): void;
  readonly isRunning: boolean;
  readonly runCount: number;
  /** Epoch ms of the most recent run, or null. */
  readonly lastRun: number | null;
  /** Epoch ms of the next scheduled run, or null when stopped/exhausted. */
  readonly nextRun: number | null;
}

export interface Scheduler {
  /** Run `task` every `interval` (ms or duration string). */
  every(interval: number | string, task: () => void | Promise<void>, opts?: JobOptions): Job;
  /** Run `task` on a 5-field cron schedule. */
  cron(expr: string, task: () => void | Promise<void>, opts?: JobOptions & { utc?: boolean }): Job;
  /** Run `task` once after `delay` (ms or duration string). */
  after(delay: number | string, task: () => void | Promise<void>, opts?: JobOptions): Job;
  /** Run `task` once at an absolute time (past/now → asap). */
  at(when: Date | number, task: () => void | Promise<void>, opts?: JobOptions): Job;
  /** Every job created on this scheduler. */
  list(): Job[];
  /** Start all jobs. */
  start(): void;
  /** Stop all jobs. */
  stop(): void;
  /** Stop all jobs and drop them. */
  clear(): void;
}

type NextFn = (from: number) => number | null;

interface JobDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => TimerHandle;
  clearTimer: (h: TimerHandle) => void;
  onError?: (error: unknown, jobName: string) => void;
}

class JobImpl implements Job {
  name: string;
  private task: () => void | Promise<void>;
  private computeNext: NextFn;
  private oneShot: boolean;
  private immediate: boolean;
  private overlap: boolean;
  private jitter: number;
  private maxRuns: number | null;
  private deps: JobDeps;

  private running = false;
  private timer: TimerHandle | null = null;
  private pending = false; // an async run is in-flight
  private _runCount = 0;
  private _lastRun: number | null = null;
  private _nextRun: number | null = null;

  constructor(
    name: string,
    task: () => void | Promise<void>,
    computeNext: NextFn,
    oneShot: boolean,
    opts: JobOptions,
    deps: JobDeps,
  ) {
    this.name = name;
    this.task = task;
    this.computeNext = computeNext;
    this.oneShot = oneShot;
    this.immediate = opts.immediate ?? false;
    this.overlap = opts.overlap ?? false;
    this.jitter = opts.jitter ?? 0;
    this.maxRuns = opts.maxRuns ?? null;
    this.deps = deps;
  }

  get isRunning(): boolean {
    return this.running;
  }
  get runCount(): number {
    return this._runCount;
  }
  get lastRun(): number | null {
    return this._lastRun;
  }
  get nextRun(): number | null {
    return this._nextRun;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const t = this.deps.now();
    // `immediate` fires only on a fresh start, not on resume-after-stop.
    if (this.immediate && !this.oneShot && this._runCount === 0) {
      this.invoke(t);
      if (this.exhausted()) {
        this.finish();
        return;
      }
    }
    this.scheduleNext(t);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    this._nextRun = null;
  }

  private finish(): void {
    this.running = false;
    this.timer = null;
    this._nextRun = null;
  }

  private exhausted(): boolean {
    return this.maxRuns !== null && this._runCount >= this.maxRuns;
  }

  private scheduleNext(from: number): void {
    const next = this.computeNext(from);
    if (next === null) {
      this.finish();
      return;
    }
    this._nextRun = next;
    let delay = next - from;
    if (delay < 0) delay = 0;
    if (this.jitter > 0) delay += Math.floor(Math.random() * this.jitter);
    this.timer = this.deps.setTimer(() => this.tick(), delay);
  }

  private tick(): void {
    this.timer = null;
    if (!this.running) return;
    const t = this.deps.now();

    const canRun = this.overlap || !this.pending;
    if (canRun) this.invoke(t);

    if (this.oneShot && canRun) {
      this.finish();
      return;
    }
    if (this.exhausted()) {
      this.finish();
      return;
    }
    this.scheduleNext(t);
  }

  private invoke(t: number): void {
    this._runCount++;
    this._lastRun = t;
    let result: void | Promise<void>;
    try {
      result = this.task();
    } catch (err) {
      this.reportError(err);
      return;
    }
    if (result != null && typeof (result as Promise<void>).then === "function") {
      this.pending = true;
      Promise.resolve(result).then(
        () => {
          this.pending = false;
        },
        (err) => {
          this.pending = false;
          this.reportError(err);
        },
      );
    }
  }

  private reportError(err: unknown): void {
    if (this.deps.onError) {
      try {
        this.deps.onError(err, this.name);
      } catch {
        /* an onError that itself throws must never break the scheduler */
      }
    }
  }
}

export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const now = options.now ?? (() => Date.now());
  const setTimer =
    options.setTimer ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((h: TimerHandle) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  const deps: JobDeps = { now, setTimer, clearTimer, onError: options.onError };

  const jobs: JobImpl[] = [];
  let counter = 0;

  function add(
    task: () => void | Promise<void>,
    computeNext: NextFn,
    oneShot: boolean,
    opts: JobOptions,
  ): Job {
    const name = opts.name ?? `job-${++counter}`;
    const job = new JobImpl(name, task, computeNext, oneShot, opts, deps);
    jobs.push(job);
    job.start(); // jobs are live as soon as they are created
    return job;
  }

  return {
    every(interval, task, opts = {}) {
      const ms = toMs(interval);
      if (!(ms >= 0)) throw new Error("every: interval must be >= 0 ms");
      return add(task, (from) => from + ms, false, opts);
    },
    cron(expr, task, opts = {}) {
      parseCron(expr); // validate eagerly
      const utc = opts.utc ?? false;
      return add(task, (from) => nextCronRun(expr, from, utc), false, opts);
    },
    after(delay, task, opts = {}) {
      const ms = toMs(delay);
      return add(task, (from) => from + ms, true, opts);
    },
    at(when, task, opts = {}) {
      const target = when instanceof Date ? when.getTime() : when;
      return add(task, () => target, true, opts);
    },
    list() {
      return jobs.slice();
    },
    start() {
      for (const j of jobs) j.start();
    },
    stop() {
      for (const j of jobs) j.stop();
    },
    clear() {
      for (const j of jobs) j.stop();
      jobs.length = 0;
    },
  };
}
