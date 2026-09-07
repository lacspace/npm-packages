/**
 * @lacspace/duration
 *
 * A zero-dependency, isomorphic Duration value type. It is the DATA / ARITHMETIC
 * side of time spans: parse ISO-8601 durations, build them from parts, normalize
 * them, do unit math and convert them to numbers.
 *
 * It is deliberately NOT a display library. For humanized output
 * (`"1h 30m"`, `"in 2 days"`) pair `dur.toMillis()` with `@lacspace/humanize`
 * (kept as a separate, optional peer — this package has zero dependencies):
 *
 *     import { duration } from "@lacspace/duration";
 *     import { duration as humanize } from "@lacspace/humanize";
 *     humanize(duration({ hours: 1, minutes: 30 }).toMillis()); // "1h 30m"
 *
 * Calendar honesty: months and years have no fixed number of milliseconds, so
 * this library never silently pretends a month is 30 days. Conversions that would
 * require collapsing months/years to a millisecond count THROW unless you opt in
 * explicitly (see `toMillis`). Weeks and days ARE treated as fixed
 * (1 week = 7 days, 1 day = 24 h) — an intentional, documented simplification
 * that ignores DST / leap seconds.
 */

/* -------------------------------------------------------------------------- */
/*  Unit conversion constants (fixed, calendar-independent)                    */
/* -------------------------------------------------------------------------- */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
export const MS_PER_WEEK = 604_800_000;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Every field a Duration can hold. All optional; missing fields are 0. */
export interface DurationParts {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/** A unit `.as()` / `msPerUnit` understand. Fixed units need no options. */
export type DurationUnit =
  | "years"
  | "months"
  | "weeks"
  | "days"
  | "hours"
  | "minutes"
  | "seconds"
  | "milliseconds";

/**
 * Options for calendar-dependent conversions. Supplying `assumeMonthDays`
 * (and/or `assumeYearDays`) is your explicit opt-in to approximating months and
 * years as a fixed number of days. If a Duration carries months/years and the
 * relevant option is absent, conversion THROWS rather than guess.
 *
 * If `assumeMonthDays` is given but `assumeYearDays` is not, a year is treated
 * as `assumeMonthDays * 12` days.
 */
export interface CalendarOptions {
  assumeMonthDays?: number;
  assumeYearDays?: number;
}

const FIELD_ORDER = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
] as const;

type Field = (typeof FIELD_ORDER)[number];

const DURATION_BRAND = Symbol.for("@lacspace/duration.Duration");

/* -------------------------------------------------------------------------- */
/*  Duration                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * An immutable time span. Every mutating-looking method returns a NEW Duration;
 * the receiver is never changed. Fields are kept separate (Luxon-style) so that
 * calendar-dependent units (months/years) are never conflated with fixed units.
 */
export class Duration {
  /** @internal brand for cross-realm `isDuration`. */
  readonly [DURATION_BRAND] = true as const;

  readonly years: number;
  readonly months: number;
  readonly weeks: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly milliseconds: number;

  constructor(parts: DurationParts = {}) {
    this.years = coerce(parts.years, "years");
    this.months = coerce(parts.months, "months");
    this.weeks = coerce(parts.weeks, "weeks");
    this.days = coerce(parts.days, "days");
    this.hours = coerce(parts.hours, "hours");
    this.minutes = coerce(parts.minutes, "minutes");
    this.seconds = coerce(parts.seconds, "seconds");
    this.milliseconds = coerce(parts.milliseconds, "milliseconds");
    Object.freeze(this);
  }

  /** A shared zero-length Duration. */
  static readonly zero: Duration = new Duration();

  /* ----------------------------- construction ---------------------------- */

  /** Build a Duration from an exact millisecond count (no months/years). */
  static fromMillis(ms: number): Duration {
    if (typeof ms !== "number" || !Number.isFinite(ms)) {
      throw new TypeError(`Duration.fromMillis: expected a finite number, got ${describe(ms)}`);
    }
    const sign = ms < 0 ? -1 : 1;
    let rem = Math.abs(ms);
    const days = Math.trunc(rem / MS_PER_DAY);
    rem -= days * MS_PER_DAY;
    const hours = Math.trunc(rem / MS_PER_HOUR);
    rem -= hours * MS_PER_HOUR;
    const minutes = Math.trunc(rem / MS_PER_MINUTE);
    rem -= minutes * MS_PER_MINUTE;
    const seconds = Math.trunc(rem / MS_PER_SECOND);
    rem -= seconds * MS_PER_SECOND;
    return new Duration({
      days: sign * days,
      hours: sign * hours,
      minutes: sign * minutes,
      seconds: sign * seconds,
      milliseconds: sign * rem,
    });
  }

  /**
   * Exact, calendar-free span between two Dates (`b - a`), as milliseconds.
   * Result is negative when `b` precedes `a`.
   */
  static between(a: Date, b: Date): Duration {
    if (!(a instanceof Date) || !(b instanceof Date)) {
      throw new TypeError("Duration.between: both arguments must be Date instances");
    }
    const ta = a.getTime();
    const tb = b.getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) {
      throw new RangeError("Duration.between: received an Invalid Date");
    }
    return Duration.fromMillis(tb - ta);
  }

  /* ------------------------------ arithmetic ----------------------------- */

  /** Add another Duration (or parts) field-by-field. */
  add(other: Duration | DurationParts): Duration {
    const o = asParts(other);
    return new Duration(mapFields((f) => this[f] + fieldOf(o, f)));
  }

  /** Subtract another Duration (or parts) field-by-field. */
  subtract(other: Duration | DurationParts): Duration {
    const o = asParts(other);
    return new Duration(mapFields((f) => this[f] - fieldOf(o, f)));
  }

  /** Flip the sign of every field. */
  negate(): Duration {
    return new Duration(mapFields((f) => -this[f]));
  }

  /**
   * Absolute magnitude. Durations are treated as single-signed here: the overall
   * sign is that of the first non-zero field (years first, milliseconds last);
   * if negative, every field is negated. Mixed-sign durations (which can arise
   * from raw `subtract`) are coerced to all-positive — call `.normalize()` first
   * if you need a predictable single sign.
   */
  abs(): Duration {
    return this.sign() < 0 ? this.negate() : this;
  }

  /** Multiply every field by `factor` (may produce fractional fields). */
  scale(factor: number): Duration {
    if (typeof factor !== "number" || !Number.isFinite(factor)) {
      throw new TypeError(`Duration.scale: expected a finite number, got ${describe(factor)}`);
    }
    return new Duration(mapFields((f) => this[f] * factor));
  }

  /* ------------------------------ normalize ------------------------------ */

  /**
   * Carry overflow between fixed units: milliseconds → seconds → minutes → hours
   * → days (60/60/24), and fold weeks into days (1 week = 7 days). Months are
   * carried into years (12 months = 1 year) but NEVER into days — that would be
   * calendar-dependent and is left to the caller. The resulting time fields all
   * share one sign.
   */
  normalize(): Duration {
    // Calendar part: carry months -> years only.
    const totalMonths = this.years * 12 + this.months;
    const mSign = totalMonths < 0 ? -1 : 1;
    const absMonths = Math.abs(totalMonths);
    const years = mSign * Math.trunc(absMonths / 12);
    const months = mSign * (absMonths - Math.trunc(absMonths / 12) * 12);

    // Time part: fold everything (incl. weeks) to ms, then re-expand into days.
    const totalMs =
      this.weeks * MS_PER_WEEK +
      this.days * MS_PER_DAY +
      this.hours * MS_PER_HOUR +
      this.minutes * MS_PER_MINUTE +
      this.seconds * MS_PER_SECOND +
      this.milliseconds;
    const time = Duration.fromMillis(totalMs);

    return new Duration({
      years,
      months,
      weeks: 0,
      days: time.days,
      hours: time.hours,
      minutes: time.minutes,
      seconds: time.seconds,
      milliseconds: time.milliseconds,
    });
  }

  /* ----------------------------- conversions ----------------------------- */

  /**
   * Total milliseconds using fixed conversions for the time part.
   *
   * If this Duration carries `months` or `years`, conversion is calendar-
   * dependent: it THROWS unless you opt in via `assumeMonthDays` /
   * `assumeYearDays`. (With `assumeMonthDays` set but `assumeYearDays` omitted,
   * a year is treated as `assumeMonthDays * 12` days.)
   */
  toMillis(opts: CalendarOptions = {}): number {
    let ms =
      this.weeks * MS_PER_WEEK +
      this.days * MS_PER_DAY +
      this.hours * MS_PER_HOUR +
      this.minutes * MS_PER_MINUTE +
      this.seconds * MS_PER_SECOND +
      this.milliseconds;

    if (this.months !== 0) {
      if (opts.assumeMonthDays == null) {
        throw new RangeError(
          "Duration.toMillis: this duration includes months, which have no fixed " +
            "millisecond length. Pass { assumeMonthDays } to approximate explicitly.",
        );
      }
      ms += this.months * opts.assumeMonthDays * MS_PER_DAY;
    }

    if (this.years !== 0) {
      const yearDays =
        opts.assumeYearDays ??
        (opts.assumeMonthDays != null ? opts.assumeMonthDays * 12 : undefined);
      if (yearDays == null) {
        throw new RangeError(
          "Duration.toMillis: this duration includes years, which have no fixed " +
            "millisecond length. Pass { assumeYearDays } (or { assumeMonthDays }) to " +
            "approximate explicitly.",
        );
      }
      ms += this.years * yearDays * MS_PER_DAY;
    }

    return ms;
  }

  /** Total seconds; same calendar rules as {@link toMillis}. */
  toSeconds(opts: CalendarOptions = {}): number {
    return this.toMillis(opts) / MS_PER_SECOND;
  }

  /**
   * Convert the whole duration to a number of one `unit`. Uses fixed conversions
   * for fixed units; `months`/`years` targets (or a duration containing them)
   * require {@link CalendarOptions} — see {@link toMillis}.
   */
  as(unit: DurationUnit, opts: CalendarOptions = {}): number {
    return this.toMillis(opts) / msPerUnit(unit, opts);
  }

  /* -------------------------- ISO serialization -------------------------- */

  /**
   * Serialize to an ISO-8601 duration string. A duration made purely of weeks
   * renders as `PnW`; otherwise weeks are folded into days (ISO-8601 forbids
   * mixing `W` with other components). A wholly non-positive duration renders
   * with a leading `-`. Round-trips with {@link parseDuration}.
   */
  toISO(): string {
    if (this.isZero()) return "PT0S";

    // Single-signed output: emit magnitudes, prefix '-' if overall negative.
    const s = this.sign();
    const v = (x: number) => Math.abs(x);

    const onlyWeeks =
      this.weeks !== 0 &&
      this.years === 0 &&
      this.months === 0 &&
      this.days === 0 &&
      this.hours === 0 &&
      this.minutes === 0 &&
      this.seconds === 0 &&
      this.milliseconds === 0;

    let out = "P";
    if (onlyWeeks) {
      out += `${fmt(v(this.weeks))}W`;
    } else {
      if (this.years) out += `${fmt(v(this.years))}Y`;
      if (this.months) out += `${fmt(v(this.months))}M`;
      const totalDays = v(this.days) + v(this.weeks) * 7;
      if (totalDays) out += `${fmt(totalDays)}D`;

      const secondsCombined = v(this.seconds) + v(this.milliseconds) / MS_PER_SECOND;
      if (this.hours || this.minutes || secondsCombined) {
        out += "T";
        if (this.hours) out += `${fmt(v(this.hours))}H`;
        if (this.minutes) out += `${fmt(v(this.minutes))}M`;
        if (secondsCombined) out += `${fmt(secondsCombined)}S`;
      }
    }
    return s < 0 ? `-${out}` : out;
  }

  /** JSON representation is the ISO-8601 string. */
  toJSON(): string {
    return this.toISO();
  }

  /** Alias of {@link toISO}. */
  toString(): string {
    return this.toISO();
  }

  /** Return a plain object of the raw fields. */
  toObject(): Required<DurationParts> {
    return {
      years: this.years,
      months: this.months,
      weeks: this.weeks,
      days: this.days,
      hours: this.hours,
      minutes: this.minutes,
      seconds: this.seconds,
      milliseconds: this.milliseconds,
    };
  }

  /* ----------------------------- comparison ------------------------------ */

  /** True when there is no span at all. */
  isZero(): boolean {
    return FIELD_ORDER.every((f) => this[f] === 0);
  }

  /**
   * Value equality. Compares NORMALIZED forms, so `P1W` equals `P7D` and
   * `PT60M` equals `PT1H`. Calendar-honest: `P1M` does NOT equal `P30D`
   * (a month is not fixed at 30 days).
   */
  equals(other: Duration): boolean {
    const a = this.normalize();
    const b = other.normalize();
    return FIELD_ORDER.every((f) => a[f] === b[f]);
  }

  /**
   * Ordering, returning -1 / 0 / 1. Fixed units use exact conversions. Months
   * and years are ordered using a NOMINAL basis (1 month ≈ 30 days,
   * 1 year ≈ 365 days) purely so that `compare` / `min` / `max` are total
   * orders — this nominal basis is NEVER used by value conversions like
   * {@link toMillis} or {@link equals}.
   */
  compare(other: Duration): -1 | 0 | 1 {
    const a = nominalMs(this);
    const b = nominalMs(other);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /* ------------------------------ internals ------------------------------ */

  /** Overall sign via the first non-zero field (years → milliseconds). */
  private sign(): number {
    for (const f of FIELD_ORDER) {
      if (this[f] > 0) return 1;
      if (this[f] < 0) return -1;
    }
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/*  Factory + parsing                                                          */
/* -------------------------------------------------------------------------- */

/** Build a Duration from parts (`{ hours: 1 }`) or an exact ms count. */
export function duration(input: DurationParts | number): Duration {
  if (typeof input === "number") return Duration.fromMillis(input);
  if (input && typeof input === "object") return new Duration(input);
  throw new TypeError(`duration: expected parts object or number, got ${describe(input)}`);
}

// [sign] P [nY] [nM] [nW] [nD] [ T [nH] [nM] [nS] ]  — fractions allowed (last-only enforced below)
const ISO_RE =
  /^([+-])?P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;

/**
 * Parse an ISO-8601 duration (`P3Y6M4DT12H30M5S`, `PT1H30M`, `P1W`,
 * `-PT30M`, fractional last component like `PT0.5H`). Throws a clear error on
 * malformed input.
 */
export function parseDuration(iso: string): Duration {
  if (typeof iso !== "string") {
    throw new TypeError(`parseDuration: expected a string, got ${describe(iso)}`);
  }
  const input = iso.trim();
  const m = ISO_RE.exec(input);
  if (!m) {
    throw new SyntaxError(`parseDuration: not a valid ISO-8601 duration: ${JSON.stringify(iso)}`);
  }

  const [, signStr, y, mo, w, d, h, mi, s] = m;
  const timeParts = [h, mi, s];
  const dateParts = [y, mo, w, d];
  const hasTimeMarker = /T/.test(input);
  const anyDate = dateParts.some((p) => p !== undefined);
  const anyTime = timeParts.some((p) => p !== undefined);

  if (!anyDate && !anyTime) {
    // Matched "P" / "PT" / "+P" with no components.
    throw new SyntaxError(
      `parseDuration: ISO-8601 duration has no components: ${JSON.stringify(iso)}`,
    );
  }
  if (hasTimeMarker && !anyTime) {
    throw new SyntaxError(
      `parseDuration: 'T' designator present but no time components: ${JSON.stringify(iso)}`,
    );
  }

  // Fractions are permitted by ISO-8601 only on the LAST present component.
  const present = [y, mo, w, d, h, mi, s];
  let lastIdx = -1;
  for (let i = present.length - 1; i >= 0; i--) {
    if (present[i] !== undefined) {
      lastIdx = i;
      break;
    }
  }
  for (let i = 0; i < present.length; i++) {
    const p = present[i];
    if (p !== undefined && /[.,]/.test(p) && i !== lastIdx) {
      throw new SyntaxError(
        `parseDuration: only the last component may be fractional: ${JSON.stringify(iso)}`,
      );
    }
  }

  const sign = signStr === "-" ? -1 : 1;
  const num = (p: string | undefined): number => (p === undefined ? 0 : Number(p.replace(",", ".")));

  return new Duration({
    years: sign * num(y),
    months: sign * num(mo),
    weeks: sign * num(w),
    days: sign * num(d),
    hours: sign * num(h),
    minutes: sign * num(mi),
    seconds: sign * num(s),
  });
}

/** Non-throwing {@link parseDuration}; returns null on malformed input. */
export function tryParseDuration(iso: string): Duration | null {
  try {
    return parseDuration(iso);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers / statics                                                          */
/* -------------------------------------------------------------------------- */

/** Runtime type guard, safe across realms. */
export function isDuration(x: unknown): x is Duration {
  return (
    x instanceof Duration ||
    (typeof x === "object" && x !== null && (x as Record<symbol, unknown>)[DURATION_BRAND] === true)
  );
}

/** The largest of the given durations (by {@link Duration.compare}). */
export function maxDuration(...durations: Duration[]): Duration {
  if (durations.length === 0) throw new RangeError("maxDuration: needs at least one Duration");
  return durations.reduce((best, d) => (d.compare(best) > 0 ? d : best));
}

/** The smallest of the given durations (by {@link Duration.compare}). */
export function minDuration(...durations: Duration[]): Duration {
  if (durations.length === 0) throw new RangeError("minDuration: needs at least one Duration");
  return durations.reduce((best, d) => (d.compare(best) < 0 ? d : best));
}

/** Milliseconds in one whole `unit` (calendar units need options). */
export function msPerUnit(unit: DurationUnit, opts: CalendarOptions = {}): number {
  switch (unit) {
    case "milliseconds":
      return 1;
    case "seconds":
      return MS_PER_SECOND;
    case "minutes":
      return MS_PER_MINUTE;
    case "hours":
      return MS_PER_HOUR;
    case "days":
      return MS_PER_DAY;
    case "weeks":
      return MS_PER_WEEK;
    case "months": {
      if (opts.assumeMonthDays == null) {
        throw new RangeError(
          "msPerUnit('months'): months have no fixed length; pass { assumeMonthDays }.",
        );
      }
      return opts.assumeMonthDays * MS_PER_DAY;
    }
    case "years": {
      const yearDays =
        opts.assumeYearDays ??
        (opts.assumeMonthDays != null ? opts.assumeMonthDays * 12 : undefined);
      if (yearDays == null) {
        throw new RangeError(
          "msPerUnit('years'): years have no fixed length; pass { assumeYearDays } or { assumeMonthDays }.",
        );
      }
      return yearDays * MS_PER_DAY;
    }
    default: {
      const never: never = unit;
      throw new RangeError(`msPerUnit: unknown unit ${describe(never)}`);
    }
  }
}

/* ----------------------------- private utils ---------------------------- */

function coerce(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Duration: field "${field}" must be a finite number, got ${describe(value)}`);
  }
  return value;
}

function asParts(x: Duration | DurationParts): DurationParts {
  if (isDuration(x)) return x.toObject();
  if (x && typeof x === "object") return x;
  throw new TypeError(`Expected a Duration or parts object, got ${describe(x)}`);
}

function fieldOf(o: DurationParts, f: Field): number {
  const v = o[f];
  return v === undefined ? 0 : v;
}

function mapFields(fn: (f: Field) => number): DurationParts {
  const out: DurationParts = {};
  for (const f of FIELD_ORDER) out[f] = fn(f);
  return out;
}

/** Nominal ms for ORDERING ONLY (month≈30d, year≈365d). Never a value. */
function nominalMs(d: Duration): number {
  return (
    d.years * 365 * MS_PER_DAY +
    d.months * 30 * MS_PER_DAY +
    d.weeks * MS_PER_WEEK +
    d.days * MS_PER_DAY +
    d.hours * MS_PER_HOUR +
    d.minutes * MS_PER_MINUTE +
    d.seconds * MS_PER_SECOND +
    d.milliseconds
  );
}

/** Format a number for ISO output: trim trailing zeros, no exponent. */
function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Avoid scientific notation for tiny fractional seconds; trim trailing zeros.
  let str = n.toFixed(9);
  str = str.replace(/\.?0+$/, "");
  return str;
}

function describe(x: unknown): string {
  if (x === null) return "null";
  if (typeof x === "number" && Number.isNaN(x)) return "NaN";
  const t = typeof x;
  return t === "object" || t === "function" ? t : `${t} ${JSON.stringify(x)}`;
}
