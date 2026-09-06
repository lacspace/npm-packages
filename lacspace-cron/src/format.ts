/**
 * Human-friendly output helpers: relative time phrasing ("in 3 hours") and an
 * importable iCalendar (.ics) export of upcoming runs. Both are zero-dep — the
 * relative phrasing uses the built-in `Intl.RelativeTimeFormat`.
 */
import { nextRuns } from "./schedule.js";
import { explainCron } from "./explain.js";

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1_000],
];

/**
 * Describe `date` relative to `from` (default now), e.g. `"in 3 hours"`,
 * `"in 2 days"`, `"5 minutes ago"`. Picks the largest sensible unit.
 */
export function describeRelative(date: Date, from: Date = new Date()): string {
  const diff = date.getTime() - from.getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  const abs = Math.abs(diff);
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "second");
}

/** Options for {@link toICS}. */
export interface ICSOptions {
  /** Start instant (exclusive). Defaults to now. */
  from?: Date;
  /** IANA timezone used to compute + explain the runs. Defaults to host tz. */
  tz?: string;
  /** How many upcoming runs to emit as events. Defaults to 5. */
  count?: number;
  /** Seed for resolving Jenkins-style `H` tokens. */
  seed?: string;
  /** Event title (SUMMARY). Defaults to the plain-English explanation. */
  title?: string;
  /** Event length in minutes (DTEND = DTSTART + this). Defaults to 1. */
  durationMinutes?: number;
}

/** 32-bit FNV-1a hash — used only to build stable, unique-ish UIDs. */
function hash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Format an absolute instant as an iCalendar UTC timestamp: `20260907T090000Z`. */
function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escape a text value per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to <=75 octets with CRLF + space continuation (RFC 5545). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

/**
 * Build a valid, importable iCalendar (`.ics`) document with one VEVENT per
 * upcoming run of `expr`. Import it into any calendar app to see the schedule.
 */
export function toICS(expr: string, opts: ICSOptions = {}): string {
  const count = opts.count ?? 5;
  const nextOpts: { count: number; from?: Date; tz?: string; seed?: string } = { count };
  if (opts.from) nextOpts.from = opts.from;
  if (opts.tz) nextOpts.tz = opts.tz;
  if (opts.seed !== undefined) nextOpts.seed = opts.seed;
  const runs = nextRuns(expr, nextOpts);

  let summary = opts.title;
  if (summary === undefined) {
    try {
      summary = explainCron(expr, opts.seed === undefined ? {} : { seed: opts.seed });
    } catch {
      summary = expr;
    }
  }
  const durMs = (opts.durationMinutes ?? 1) * 60_000;
  const stamp = icsStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lacspace//lacspace-cron//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`cron: ${expr}`)}`,
  ];
  runs.forEach((d, i) => {
    const start = icsStamp(d);
    const end = icsStamp(new Date(d.getTime() + durMs));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${hash(`${expr}|${d.toISOString()}|${i}`)}-${i}@lacspace-cron`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc(`Cron: ${expr}`)}`),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
