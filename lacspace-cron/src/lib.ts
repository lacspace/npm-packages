/**
 * lacspace-cron — explain, validate and preview cron expressions in plain
 * English, and compute the next run times in any IANA timezone. Zero runtime
 * dependencies: timezone math uses the built-in `Intl` API.
 *
 * ```ts
 * import { explainCron, nextRuns, isValidCron } from "lacspace-cron";
 *
 * explainCron("0 9 * * 1-5");
 * // "At 09:00, Monday through Friday."
 *
 * isValidCron("0 9 * * 1-5"); // true
 *
 * nextRuns("0 9 * * 1-5", { tz: "America/New_York", count: 3 });
 * // [Date, Date, Date] — the next three 9am weekday instants in New York
 * ```
 *
 * Supports 5-field cron (`min hour day-of-month month day-of-week`) and 6-field
 * cron with a leading seconds field, plus `@yearly`/`@monthly`/`@weekly`/
 * `@daily`/`@hourly` macros. v0.2.0 adds the advanced day tokens `L`/`L-n`/`LW`/
 * `nW` (day-of-month) and `dL`/`d#n` (day-of-week), Jenkins-style hashed `H`
 * tokens, `@every <dur>` interval schedules, previous runs, windowed runs,
 * relative-time phrasing, `.ics` export and schedule overlap detection.
 * `@reboot` is still unsupported (it throws a clear message).
 */
export {
  parseCron,
  parseSchedule,
  parseDuration,
  isValidCron,
  isValidSchedule,
  CronError,
} from "./parse.js";
export type {
  CronFields,
  EveryFields,
  Schedule,
  ParseOptions,
  DomSpecial,
  DowSpecial,
} from "./parse.js";
export { explainCron } from "./explain.js";
export {
  nextRuns,
  prevRuns,
  runsBetween,
  countBetween,
  overlaps,
  dstWarnings,
  matchesCron,
  matchesFields,
} from "./schedule.js";
export type {
  NextRunsOptions,
  RunsBetweenOptions,
  OverlapOptions,
  OverlapResult,
  DstOptions,
  DstWarning,
} from "./schedule.js";
export { describeRelative, toICS } from "./format.js";
export type { ICSOptions } from "./format.js";
