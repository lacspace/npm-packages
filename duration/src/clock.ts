/**
 * Digital-clock formatting (`HH:MM:SS`) for the FIXED part of a Duration, plus a
 * matching parser so the two round-trip. Because a clock string is a fixed
 * millisecond count, months/years cannot be represented: like `.toMillis()`,
 * {@link toClock} THROWS on a Duration that carries months or years.
 */

import { Duration, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "./index";
import { durationSign } from "./ops";

/** Options for {@link toClock}. All optional. */
export interface ClockOptions {
  /**
   * Emit a leading day segment (`D:HH:MM:SS`) instead of rolling whole days into
   * the hours field (`36:00:00`). Defaults to `false`.
   */
  showDays?: boolean;
  /** Sub-second digits to append as `.fff` (0–3). Defaults to `0`. */
  fractionalDigits?: number;
  /** Zero-pad the leading (hours or days) segment to two digits. Default `true`. */
  padLeading?: boolean;
}

/**
 * Format the fixed part of a Duration as a clock string. Negative durations are
 * prefixed with `-`. Hours can exceed 24 unless `showDays` is set.
 *
 * @example
 * toClock(duration({ hours: 1, minutes: 30 }));                 // "01:30:00"
 * toClock(duration({ hours: 36 }));                             // "36:00:00"
 * toClock(duration({ days: 1, hours: 12 }), { showDays: true });// "01:12:00:00"
 * toClock(duration({ seconds: 1, milliseconds: 500 }), { fractionalDigits: 3 }); // "00:00:01.500"
 */
export function toClock(d: Duration, opts: ClockOptions = {}): string {
  if (d.months !== 0 || d.years !== 0) {
    throw new RangeError(
      "toClock: durations carrying months/years have no fixed clock length; " +
        "convert or drop them first (see rebalance / toMillis).",
    );
  }

  const fractionalDigits = opts.fractionalDigits ?? 0;
  if (
    !Number.isInteger(fractionalDigits) ||
    fractionalDigits < 0 ||
    fractionalDigits > 3
  ) {
    throw new RangeError("toClock: fractionalDigits must be an integer between 0 and 3");
  }
  const padLeading = opts.padLeading ?? true;

  const sign = durationSign(d);
  const totalMs = Math.abs(d.toMillis());

  let rem = totalMs;
  const days = Math.trunc(rem / MS_PER_DAY);
  rem -= days * MS_PER_DAY;
  const hoursWithinDay = Math.trunc(rem / MS_PER_HOUR);
  const totalHours = Math.trunc(totalMs / MS_PER_HOUR);
  rem -= hoursWithinDay * MS_PER_HOUR;
  const minutes = Math.trunc(rem / MS_PER_MINUTE);
  rem -= minutes * MS_PER_MINUTE;
  const seconds = Math.trunc(rem / MS_PER_SECOND);
  const millis = rem - seconds * MS_PER_SECOND;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const lead = (n: number) => (padLeading ? pad2(n) : String(n));

  let out: string;
  if (opts.showDays) {
    out = `${lead(days)}:${pad2(hoursWithinDay)}:${pad2(minutes)}:${pad2(seconds)}`;
  } else {
    out = `${lead(totalHours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  if (fractionalDigits > 0) {
    const frac = Math.round(millis).toString().padStart(3, "0").slice(0, 3);
    out += `.${frac.slice(0, fractionalDigits)}`;
  }

  return sign < 0 ? `-${out}` : out;
}

/**
 * Parse a clock string back into a Duration. Accepts 1–4 colon-separated
 * segments: `SS`, `MM:SS`, `HH:MM:SS`, or `DD:HH:MM:SS`. The seconds segment may
 * carry a decimal fraction (`SS.fff`). An optional leading `-` negates. Round
 * trips with {@link toClock}.
 *
 * @example
 * parseClock("01:30:00").toISO();      // "PT1H30M"
 * parseClock("36:00:00").toMillis();   // 129600000
 * parseClock("01:12:00:00").toISO();   // "P1DT12H"
 * parseClock("-00:00:30").toISO();     // "-PT30S"
 */
export function parseClock(clock: string): Duration {
  if (typeof clock !== "string") {
    throw new TypeError(`parseClock: expected a string, got ${typeof clock}`);
  }
  const trimmed = clock.trim();
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;

  const segs = body.split(":");
  if (segs.length < 1 || segs.length > 4) {
    throw new SyntaxError(`parseClock: expected 1–4 colon-separated segments: ${JSON.stringify(clock)}`);
  }

  const nums = segs.map((seg, i) => {
    const isSeconds = i === segs.length - 1;
    const pattern = isSeconds ? /^\d+(?:\.\d+)?$/ : /^\d+$/;
    if (!pattern.test(seg)) {
      throw new SyntaxError(`parseClock: invalid segment ${JSON.stringify(seg)} in ${JSON.stringify(clock)}`);
    }
    return Number(seg);
  });

  // Right-align: last is always seconds, then minutes, hours, days.
  const rev = [...nums].reverse();
  const seconds = rev[0] ?? 0;
  const minutes = rev[1] ?? 0;
  const hours = rev[2] ?? 0;
  const days = rev[3] ?? 0;

  const sign = negative ? -1 : 1;
  return new Duration({
    days: sign * days,
    hours: sign * hours,
    minutes: sign * minutes,
    seconds: sign * seconds,
  });
}
