/**
 * Turn a parsed cron expression into a human-readable English sentence, e.g.
 * `0 9 * * 1-5` → "At 09:00, Monday through Friday."
 */
import { parseSchedule } from "./parse.js";
import type { CronFields, ParseOptions, DomSpecial, DowSpecial } from "./parse.js";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function isFull(vals: number[], min: number, max: number): boolean {
  return vals.length === max - min + 1;
}

/** If `vals` is a `*` + `/step` sequence (starts at min, even spacing, covers to max), return the step. */
function stepOf(vals: number[], min: number, max: number): number | null {
  if (vals.length < 2 || vals[0] !== min) return null;
  const step = vals[1]! - vals[0]!;
  if (step <= 0) return null;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i]! - vals[i - 1]! !== step) return null;
  }
  // The last value plus another step must overshoot max — i.e. it's a genuine */n run.
  if (vals[vals.length - 1]! + step <= max) return null;
  return step;
}

function groupRanges(values: number[]): Array<[number, number]> {
  const sorted = [...values].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const v of sorted) {
    const last = runs[runs.length - 1];
    if (last && v === last[1] + 1) last[1] = v;
    else runs.push([v, v]);
  }
  return runs;
}

function joinAnd(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Render a value list as English, collapsing contiguous runs of 3+ into "X through Y". */
function humanList(values: number[], fmt: (n: number) => string): string {
  const pieces: string[] = [];
  for (const [a, b] of groupRanges(values)) {
    if (b - a >= 2) pieces.push(`${fmt(a)} through ${fmt(b)}`);
    else for (let v = a; v <= b; v++) pieces.push(fmt(v));
  }
  return joinAnd(pieces);
}

function weekdayList(values: number[]): string {
  return humanList(values, (n) => WEEKDAY_NAMES[n]!);
}

function monthList(values: number[]): string {
  return humanList(values, (n) => MONTH_NAMES[n]!);
}

function describeTime(f: CronFields): string {
  const { minute, hour, second } = f;
  const mnFull = isFull(minute, 0, 59);
  const hrFull = isFull(hour, 0, 23);
  const mnStep = stepOf(minute, 0, 59);
  const hrStep = stepOf(hour, 0, 23);

  if (f.hasSeconds) {
    const secFull = isFull(second, 0, 59);
    const secStep = stepOf(second, 0, 59);
    if (secFull && mnFull && hrFull) return "every second";
    if (secStep && mnFull && hrFull) return `every ${secStep} seconds`;
    if (second.length === 1 && minute.length === 1 && hour.length === 1) {
      return `at ${pad(hour[0]!)}:${pad(minute[0]!)}:${pad(second[0]!)}`;
    }
  }

  // Single exact time of day.
  if (minute.length === 1 && hour.length === 1) {
    return `at ${pad(hour[0]!)}:${pad(minute[0]!)}`;
  }

  // "Every minute" family.
  if (mnFull) {
    if (hrFull) return "every minute";
    if (hrStep) return `every minute, every ${hrStep} hours`;
    return `every minute past ${hourWords(hour)}`;
  }
  if (mnStep) {
    if (hrFull) return `every ${mnStep} minutes`;
    return `every ${mnStep} minutes past ${hourWords(hour)}`;
  }
  if (minute.length === 1 && hrFull) {
    const m = minute[0]!;
    if (m === 0) return "every hour, on the hour";
    return `at ${m} minute${m === 1 ? "" : "s"} past every hour`;
  }

  return `at ${humanList(minute, String)} minutes past ${hourWords(hour)}`;
}

function hourWords(hour: number[]): string {
  if (isFull(hour, 0, 23)) return "every hour";
  if (hour.length === 1) return `${pad(hour[0]!)}:00`;
  return `hours ${humanList(hour, (n) => pad(n))}`;
}

function domSpecialPhrase(s: DomSpecial): string {
  switch (s.type) {
    case "last": return "the last day of the month";
    case "lastOffset":
      return s.offset === 0
        ? "the last day of the month"
        : `${s.offset} day${s.offset === 1 ? "" : "s"} before the end of the month`;
    case "lastWeekday": return "the last weekday of the month";
    case "nearestWeekday": return `the weekday nearest the ${ordinal(s.day ?? 1)}`;
  }
}

function dowSpecialPhrase(s: DowSpecial): string {
  const name = WEEKDAY_NAMES[s.weekday]!;
  if (s.type === "last") return `the last ${name} of the month`;
  return `the ${ordinal(s.nth ?? 1)} ${name} of the month`;
}

/** Build the day-of-month clause (numeric days + advanced tokens). */
function domClause(f: CronFields): string {
  const parts: string[] = [];
  if (f.dayOfMonth.length) parts.push(`the ${humanList(f.dayOfMonth, ordinal)} of the month`);
  for (const s of f.dayOfMonthSpecial) parts.push(domSpecialPhrase(s));
  return parts.length ? `on ${joinAnd(parts)}` : "";
}

/** Build the day-of-week clause (numeric weekdays + advanced tokens). */
function dowClause(f: CronFields): string {
  const parts: string[] = [];
  if (f.dayOfWeek.length) parts.push(weekdayList(f.dayOfWeek));
  for (const s of f.dayOfWeekSpecial) parts.push(dowSpecialPhrase(s));
  return joinAnd(parts.filter(Boolean));
}

function describeDays(f: CronFields): string {
  const segs: string[] = [];
  const monthRestricted = !isFull(f.month, 1, 12);

  const domPhrase = domClause(f);
  const dowPhrase = dowClause(f);

  if (f.domRestricted && f.dowRestricted) {
    // Standard cron OR-rule: a day matches if EITHER field matches.
    segs.push(`${dowPhrase} — or ${domPhrase}`);
  } else if (f.domRestricted) {
    segs.push(domPhrase);
  } else if (f.dowRestricted) {
    segs.push(dowPhrase);
  }

  if (monthRestricted) segs.push(`in ${monthList(f.month)}`);
  return segs.filter(Boolean).join(", ");
}

/** Describe an `@every` interval in plain English, e.g. "Every 2 hours and 30 minutes". */
function describeEvery(intervalMs: number): string {
  const units: Array<[string, number]> = [
    ["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000],
    ["second", 1_000], ["millisecond", 1],
  ];
  const parts: string[] = [];
  let rest = intervalMs;
  for (const [name, ms] of units) {
    const n = Math.floor(rest / ms);
    if (n > 0) { parts.push(`${n} ${name}${n === 1 ? "" : "s"}`); rest -= n * ms; }
  }
  const body = parts.length ? joinAnd(parts) : "0 seconds";
  return `Every ${body}.`;
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Explain a cron (or `@every`) expression as a plain-English sentence. Throws {@link CronError} if invalid. */
export function explainCron(expr: string, opts: ParseOptions = {}): string {
  const sched = parseSchedule(expr, opts);
  if (sched.kind === "every") return describeEvery(sched.intervalMs);
  const f = sched;
  const time = describeTime(f);
  const days = describeDays(f);
  const sentence = days ? `${time}, ${days}` : time;
  return `${capitalize(sentence)}.`;
}
