import { getPath, isSafePath } from "./path";
import { compileSafe, testCapped, DEFAULT_MAX_INPUT_LENGTH } from "./regex";
import type { SafeRegexOptions } from "./regex";

export type Op =
  | "equals"
  | "notEquals"
  | "is"
  | "isNot"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "notIn"
  | "exists"
  | "notExists"
  | "regex";

export const OPS: readonly Op[] = Object.freeze([
  "equals", "notEquals", "is", "isNot", "contains", "notContains", "startsWith", "endsWith",
  "gt", "gte", "lt", "lte", "between", "in", "notIn", "exists", "notExists", "regex",
] as Op[]);

export interface Condition {
  field: string;
  op: Op;
  value?: unknown;
}

export interface MatchOptions<R = unknown> {
  /** "all" (default): every condition must pass. "any": at least one. */
  match?: "all" | "any";
  /** Custom field resolver. Default: dotted paths with array fan-out (see getPath). */
  getField?: (record: R, path: string) => unknown;
  /** Compare strings case-sensitively. Default false. */
  caseSensitive?: boolean;
  /** Result for an empty condition list. Default false, so an empty rule never matches everything. */
  emptyResult?: boolean;
  /** Limits for the regex op. */
  regex?: SafeRegexOptions;
}

export interface ConditionResult {
  index: number;
  field: string;
  op: string;
  value: unknown;
  passed: boolean;
  /** The resolved field value. */
  actual: unknown;
  /** Why the condition could not be evaluated (unknown op, unsafe regex, bad path …). */
  error?: string;
}

export interface Explanation {
  result: boolean;
  match: "all" | "any";
  conditions: ConditionResult[];
}

const NEGATIVE: Partial<Record<Op, Op>> = {
  notEquals: "equals",
  isNot: "is",
  notContains: "contains",
  notIn: "in",
  notExists: "exists",
};

const TRUE_WORDS = new Set(["", "true", "yes", "1", "on"]);
const FALSE_WORDS = new Set(["false", "no", "0", "off"]);

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null) return true; // "is" with no value means "is true", as in the source
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (TRUE_WORDS.has(s)) return true;
    if (FALSE_WORDS.has(s)) return false;
  }
  return null;
}

function flatten(v: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (Array.isArray(v) && depth < 10) for (const x of v) flatten(x, out, depth + 1);
  else if (v !== undefined && v !== null) out.push(v);
  return out;
}

function isNumericString(s: string): boolean {
  return s.trim() !== "" && Number.isFinite(Number(s));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string" && ISO_DATE.test(v.trim())) return Date.parse(v.trim());
  return NaN;
}

/** Compare a and b: numbers, numeric strings, Dates or ISO date strings. null when not comparable. */
export function compare(a: unknown, b: unknown): number | null {
  if (a instanceof Date || b instanceof Date) {
    const x = toMs(a);
    const y = toMs(b);
    return Number.isFinite(x) && Number.isFinite(y) ? x - y : null;
  }
  const numA = typeof a === "number" ? a : typeof a === "string" && isNumericString(a) ? Number(a) : NaN;
  const numB = typeof b === "number" ? b : typeof b === "string" && isNumericString(b) ? Number(b) : NaN;
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  if (typeof a === "string" && typeof b === "string") {
    const x = toMs(a);
    const y = toMs(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  }
  return null;
}

function norm(s: string, cs: boolean): string {
  return cs ? s : s.toLowerCase();
}

function asText(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return null;
}

function looseEquals(actual: unknown, want: unknown, cs: boolean): boolean {
  if (typeof actual === "boolean") {
    const b = toBool(want);
    return b !== null && actual === b;
  }
  if (typeof actual === "number" || actual instanceof Date || typeof want === "number" || want instanceof Date) {
    const c = compare(actual, want);
    if (c !== null) return c === 0;
  }
  const a = asText(actual);
  const w = asText(want);
  if (a === null || w === null) return false;
  return norm(a, cs) === norm(typeof want === "string" ? w.trim() : w, cs);
}

function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (value === undefined || value === null) return [];
  return [value];
}

function range(value: unknown): [unknown, unknown] | null {
  if (Array.isArray(value) && value.length === 2) return [value[0], value[1]];
  if (value && typeof value === "object" && !(value instanceof Date) && "min" in value && "max" in value) {
    const r = value as { min: unknown; max: unknown };
    return [r.min, r.max];
  }
  return null;
}

interface Ctx {
  cs: boolean;
  regex: SafeRegexOptions;
}

/** Evaluate a positive op over the candidates. Returns [passed, error?]. */
function positive(op: Op, candidates: unknown[], value: unknown, ctx: Ctx): [boolean, string?] {
  const { cs } = ctx;
  switch (op) {
    case "exists":
      return [candidates.length > 0];
    case "equals":
    case "is":
      if (value === null || (value === undefined && op === "equals")) return [candidates.length === 0];
      return [candidates.some((c) => looseEquals(c, value, cs))];
    case "contains":
    case "startsWith":
    case "endsWith": {
      const w = asText(value);
      if (w === null) return [false, "value must be a string or number"];
      const want = norm(w.trim(), cs);
      return [
        candidates.some((c) => {
          const s = asText(c);
          if (s === null) return false;
          const a = norm(s, cs);
          return op === "contains" ? a.includes(want) : op === "startsWith" ? a.startsWith(want) : a.endsWith(want);
        }),
      ];
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return [
        candidates.some((c) => {
          const d = compare(c, value);
          if (d === null) return false;
          return op === "gt" ? d > 0 : op === "gte" ? d >= 0 : op === "lt" ? d < 0 : d <= 0;
        }),
      ];
    case "between": {
      const r = range(value);
      if (!r) return [false, "between needs [min, max] or { min, max }"];
      return [
        candidates.some((c) => {
          const lo = compare(c, r[0]);
          const hi = compare(c, r[1]);
          return lo !== null && hi !== null && lo >= 0 && hi <= 0;
        }),
      ];
    }
    case "in": {
      const list = listOf(value);
      return [candidates.some((c) => list.some((w) => looseEquals(c, w, cs)))];
    }
    case "regex": {
      const re = compileSafe(value, cs, ctx.regex);
      if (typeof re === "string") return [false, re];
      const max = typeof ctx.regex.maxInputLength === "number" && ctx.regex.maxInputLength > 0 ? ctx.regex.maxInputLength : DEFAULT_MAX_INPUT_LENGTH;
      return [
        candidates.some((c) => {
          const s = asText(c);
          return s !== null && testCapped(re, s, max);
        }),
      ];
    }
    default:
      return [false, `unknown op "${String(op)}"`];
  }
}

function evalOne<R>(cond: Condition, index: number, record: R, opts: MatchOptions<R>): ConditionResult {
  const field = cond && typeof cond === "object" ? cond.field : undefined;
  const op = cond && typeof cond === "object" ? cond.op : undefined;
  const value = cond && typeof cond === "object" ? cond.value : undefined;
  const res: ConditionResult = { index, field: String(field ?? ""), op: String(op ?? ""), value, passed: false, actual: undefined };
  if (!cond || typeof cond !== "object") return { ...res, error: "condition must be an object" };
  if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) return { ...res, error: `unknown op "${String(op)}"` };
  let actual: unknown;
  try {
    if (typeof opts.getField === "function") actual = opts.getField(record, String(field ?? ""));
    else {
      if (!isSafePath(field)) return { ...res, error: "field must be a non-empty path without __proto__/prototype/constructor" };
      actual = getPath(record, field);
    }
  } catch {
    actual = undefined;
  }
  res.actual = actual;
  const ctx: Ctx = { cs: opts.caseSensitive === true, regex: opts.regex && typeof opts.regex === "object" ? opts.regex : {} };
  const candidates = flatten(actual);
  const base = NEGATIVE[op as Op];
  const [ok, error] = positive(base ?? (op as Op), candidates, value, ctx);
  if (error) return { ...res, error };
  return { ...res, passed: base ? !ok : ok };
}

/**
 * Evaluate conditions against a record and explain each one. Never throws.
 * A condition with an error (unknown op, unsafe regex, bad value) fails.
 */
export function explain<R = unknown>(conditions: readonly Condition[], record: R, opts: MatchOptions<R> = {}): Explanation {
  const o = opts && typeof opts === "object" ? opts : {};
  const match = o.match === "any" ? "any" : "all";
  const list = Array.isArray(conditions) ? conditions : [];
  const results = list.map((c, i) => evalOne(c, i, record, o));
  const result = results.length === 0 ? o.emptyResult === true : match === "any" ? results.some((r) => r.passed) : results.every((r) => r.passed);
  return { result, match, conditions: results };
}

/** Evaluate conditions against a record. Never throws. */
export function evaluate<R = unknown>(conditions: readonly Condition[], record: R, opts: MatchOptions<R> = {}): boolean {
  const o = opts && typeof opts === "object" ? opts : {};
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.length) return o.emptyResult === true;
  if (o.match === "any") {
    for (let i = 0; i < list.length; i++) if (evalOne(list[i]!, i, record, o).passed) return true;
    return false;
  }
  for (let i = 0; i < list.length; i++) if (!evalOne(list[i]!, i, record, o).passed) return false;
  return true;
}
