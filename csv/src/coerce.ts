/**
 * @lacspace/csv — type inference & coercion
 *
 * Turn the all-string rows produced by {@link parse} into typed values
 * (numbers, booleans, ISO dates, nulls). Opt-in: parse still returns strings by
 * default, so nothing existing changes. Coerce as a separate step.
 */

import type { Row } from "./index";

/** A coercion target for a column. `"auto"` infers per value. */
export type CoerceType = "string" | "number" | "boolean" | "date" | "auto";

export interface CoerceOptions {
  /** Infer types for every column (unless overridden by `columns`). Default false. */
  auto?: boolean;
  /** Per-column type override, keyed by header name. Wins over `auto`. */
  columns?: Record<string, CoerceType>;
  /** Strings that become `null`. Default `["", "null", "NULL"]`. */
  nullValues?: string[];
  /** Strings that become `true`. Default `["true", "TRUE", "True", "1"]` (last only for booleans). */
  trueValues?: string[];
  /** Strings that become `false`. Default `["false", "FALSE", "False", "0"]`. */
  falseValues?: string[];
}

const DEFAULT_NULLS = ["", "null", "NULL"];
const DEFAULT_TRUE = ["true", "TRUE", "True"];
const DEFAULT_FALSE = ["false", "FALSE", "False"];

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Is this string a safe number literal (avoids eating IDs like `"007"`, `"1e999"`)? */
function isNumeric(s: string): boolean {
  if (!NUMBER_RE.test(s)) return false;
  // Preserve identifiers with significant leading zeros ("007", "0123").
  if (/^[+-]?0\d/.test(s)) return false;
  return Number.isFinite(Number(s));
}

/**
 * Infer a single string value's most likely type: `null`, `boolean`, `number`,
 * ISO `Date`, else the original string.
 */
export function inferValue(
  value: string,
  opts: CoerceOptions = {},
): string | number | boolean | null | Date {
  const nulls = opts.nullValues ?? DEFAULT_NULLS;
  const trues = opts.trueValues ?? DEFAULT_TRUE;
  const falses = opts.falseValues ?? DEFAULT_FALSE;
  if (nulls.includes(value)) return null;
  if (trues.includes(value)) return true;
  if (falses.includes(value)) return false;
  if (isNumeric(value)) return Number(value);
  if (ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

/** Coerce a single value to an explicit {@link CoerceType}. */
export function coerceValue(
  value: string,
  type: CoerceType,
  opts: CoerceOptions = {},
): string | number | boolean | null | Date {
  const nulls = opts.nullValues ?? DEFAULT_NULLS;
  if (type !== "string" && nulls.includes(value)) return null;
  switch (type) {
    case "number": {
      const n = Number(value);
      return value.trim() === "" ? null : n;
    }
    case "boolean": {
      const trues = opts.trueValues ?? [...DEFAULT_TRUE, "1"];
      return trues.includes(value);
    }
    case "date": {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
    case "auto":
      return inferValue(value, opts);
    case "string":
    default:
      return value;
  }
}

/**
 * Coerce parsed string rows to typed rows. With `auto: true` every column is
 * inferred; `columns` sets an explicit type per header. Columns left as
 * `"string"` are copied unchanged.
 *
 * @example coerce(parse("n,ok\n3,true"), { auto: true }) // [{ n: 3, ok: true }]
 */
export function coerce<T = Record<string, unknown>>(
  rows: Row[],
  opts: CoerceOptions = {},
): T[] {
  const columns = opts.columns ?? {};
  const auto = opts.auto ?? false;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const type: CoerceType = columns[key] ?? (auto ? "auto" : "string");
      const raw = row[key] ?? "";
      out[key] = type === "string" ? raw : coerceValue(raw, type, opts);
    }
    return out as T;
  });
}
