/**
 * Cron expression parser.
 *
 * Supports standard 5-field cron (`min hour day-of-month month day-of-week`) and
 * optional 6-field cron with a leading seconds field. Per field it understands
 * `*`, ranges `a-b`, steps `*` + `/n` and `a-b/n` (and `a/n`), lists `a,b,c`,
 * month names `JAN..DEC`, weekday names `SUN..SAT` (and `7` = Sunday), and `?`
 * (treated as `*`). Named macros (`@daily`, `@hourly`, …) are expanded first.
 *
 * NOT supported (documented, thrown with a clear message): the `L`, `W` and `#`
 * modifiers, and `@reboot` (which has no wall-clock schedule).
 */

/** Thrown for any invalid or unsupported cron expression. */
export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronError";
  }
}

/** A fully-parsed cron expression: each field expanded to the set of values it matches. */
export interface CronFields {
  /** Seconds 0-59. `[0]` for 5-field expressions. */
  second: number[];
  /** Minutes 0-59. */
  minute: number[];
  /** Hours 0-23. */
  hour: number[];
  /** Days of month 1-31. */
  dayOfMonth: number[];
  /** Months 1-12. */
  month: number[];
  /** Days of week 0-6 (0 = Sunday); `7` is normalized to `0`. */
  dayOfWeek: number[];
  /** True when the day-of-month field was not `*`/`?` (affects the OR-rule). */
  domRestricted: boolean;
  /** True when the day-of-week field was not `*`/`?` (affects the OR-rule). */
  dowRestricted: boolean;
  /** True for 6-field expressions (a real seconds field was given). */
  hasSeconds: boolean;
  /** The original expression, trimmed. */
  source: string;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const WEEKDAYS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names: Record<string, number> | null;
}

function resolveToken(tok: string, spec: FieldSpec): number {
  const t = tok.trim();
  if (t === "") throw new CronError(`${spec.name}: empty value.`);
  let n: number;
  if (spec.names && /[a-z]/i.test(t)) {
    const key = t.toUpperCase();
    const found = spec.names[key];
    if (found === undefined) {
      throw new CronError(`${spec.name}: unknown name "${tok}".`);
    }
    n = found;
  } else {
    if (!/^\d+$/.test(t)) {
      throw new CronError(`${spec.name}: "${tok}" is not a valid value.`);
    }
    n = Number(t);
  }
  if (n < spec.min || n > spec.max) {
    throw new CronError(`${spec.name}: value ${n} is out of range ${spec.min}-${spec.max}.`);
  }
  return n;
}

/** Parse a single cron field into a sorted, de-duplicated list of matching values. */
function parseField(raw: string, spec: FieldSpec): number[] {
  const trimmed = raw.trim();
  if (trimmed === "") throw new CronError(`${spec.name}: empty field.`);
  if (/[LW#]/i.test(trimmed)) {
    throw new CronError(
      `${spec.name}: the 'L', 'W' and '#' modifiers are not supported yet (got "${trimmed}").`,
    );
  }
  if (trimmed === "*" || trimmed === "?") {
    return range(spec.min, spec.max, 1);
  }

  const out = new Set<number>();
  for (const part of trimmed.split(",")) {
    if (part === "") throw new CronError(`${spec.name}: empty list item in "${trimmed}".`);

    let step = 1;
    let base = part;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      base = part.slice(0, slash);
      const stepStr = part.slice(slash + 1);
      if (!/^\d+$/.test(stepStr) || Number(stepStr) <= 0) {
        throw new CronError(`${spec.name}: invalid step "${stepStr}" in "${part}".`);
      }
      step = Number(stepStr);
    }

    let lo: number;
    let hi: number;
    if (base === "*" || base === "?") {
      lo = spec.min;
      hi = spec.max;
    } else if (base.includes("-")) {
      const bits = base.split("-");
      if (bits.length !== 2) throw new CronError(`${spec.name}: invalid range "${base}".`);
      lo = resolveToken(bits[0]!, spec);
      hi = resolveToken(bits[1]!, spec);
    } else {
      lo = resolveToken(base, spec);
      // `a/n` (with a step but no explicit range) means a..max stepping by n.
      hi = slash !== -1 ? spec.max : lo;
    }
    if (lo > hi) {
      throw new CronError(`${spec.name}: range start ${lo} is after end ${hi} in "${part}".`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v += step) out.push(v);
  return out;
}

/**
 * Parse a cron expression (or macro) into fully-expanded {@link CronFields}.
 * Throws {@link CronError} with a field-specific message on anything invalid.
 */
export function parseCron(expr: string): CronFields {
  if (typeof expr !== "string") {
    throw new CronError("Expression must be a string.");
  }
  const source = expr.trim();
  if (source === "") throw new CronError("Empty cron expression.");

  const lower = source.toLowerCase();
  if (lower === "@reboot") {
    throw new CronError(
      "'@reboot' runs at daemon start-up and has no wall-clock schedule, so it can't be previewed.",
    );
  }

  let text = source;
  if (text.startsWith("@")) {
    const macro = MACROS[lower];
    if (macro === undefined) {
      throw new CronError(`Unknown macro "${source}".`);
    }
    text = macro;
  }

  const parts = text.split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    throw new CronError(
      `Expected 5 or 6 fields, got ${parts.length}. Format: "min hour day-of-month month day-of-week" (optionally a leading seconds field).`,
    );
  }

  const hasSeconds = parts.length === 6;
  const idx = hasSeconds ? 1 : 0;

  const second = hasSeconds
    ? parseField(parts[0]!, { name: "second", min: 0, max: 59, names: null })
    : [0];
  const minute = parseField(parts[idx]!, { name: "minute", min: 0, max: 59, names: null });
  const hour = parseField(parts[idx + 1]!, { name: "hour", min: 0, max: 23, names: null });
  const domRaw = parts[idx + 2]!;
  const dowRaw = parts[idx + 4]!;
  const dayOfMonth = parseField(domRaw, { name: "day-of-month", min: 1, max: 31, names: null });
  const month = parseField(parts[idx + 3]!, { name: "month", min: 1, max: 12, names: MONTHS });
  // Day-of-week is parsed with max 7 so `7` (= Sunday) is legal, then normalized to 0.
  const dowParsed = parseField(dowRaw, { name: "day-of-week", min: 0, max: 7, names: WEEKDAYS });
  const dowSet = new Set(dowParsed.map((n) => (n === 7 ? 0 : n)));
  const dayOfWeek = [...dowSet].sort((a, b) => a - b);

  const isWild = (r: string): boolean => r.trim() === "*" || r.trim() === "?";

  return {
    second,
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    domRestricted: !isWild(domRaw),
    dowRestricted: !isWild(dowRaw),
    hasSeconds,
    source,
  };
}

/** True when `expr` parses cleanly, false otherwise. Never throws. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}
