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
 * `@daily`/`@hourly` macros. The `L`, `W`, `#` modifiers and `@reboot` are not
 * supported (they throw a clear message).
 */
export { parseCron, isValidCron, CronError } from "./parse.js";
export type { CronFields } from "./parse.js";
export { explainCron } from "./explain.js";
export { nextRuns, matchesCron, matchesFields } from "./schedule.js";
export type { NextRunsOptions } from "./schedule.js";
