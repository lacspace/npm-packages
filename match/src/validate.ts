import { OPS, compare } from "./evaluate";
import type { Op } from "./evaluate";
import { isSafePath } from "./path";
import { compileSafe } from "./regex";
import type { SafeRegexOptions } from "./regex";

export interface ValidationError {
  /** Index of the condition, or -1 when the list itself is wrong. */
  index: number;
  field?: string;
  message: string;
}

export interface ValidateOptions {
  /** Same as MatchOptions.regex, so validation agrees with evaluation. */
  regex?: SafeRegexOptions;
  /** Maximum number of conditions. Default 100. */
  maxConditions?: number;
}

const NO_VALUE: ReadonlySet<Op> = new Set<Op>(["exists", "notExists"]);
const OPTIONAL_VALUE: ReadonlySet<Op> = new Set<Op>(["is", "isNot", "equals", "notEquals"]);
const STRING_OPS: ReadonlySet<Op> = new Set<Op>(["contains", "notContains", "startsWith", "endsWith"]);
const ORDER_OPS: ReadonlySet<Op> = new Set<Op>(["gt", "gte", "lt", "lte"]);

function comparable(v: unknown): boolean {
  return compare(v, v) !== null;
}

/**
 * Check conditions before saving them. Returns an empty array when they are all
 * usable. Never throws.
 */
export function validateConditions(conditions: unknown, opts: ValidateOptions = {}): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(conditions)) return [{ index: -1, message: "conditions must be an array" }];
  const max = typeof opts.maxConditions === "number" && opts.maxConditions > 0 ? opts.maxConditions : 100;
  if (conditions.length > max) errors.push({ index: -1, message: `too many conditions (max ${max})` });
  conditions.forEach((c: unknown, index) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      errors.push({ index, message: "condition must be an object" });
      return;
    }
    const { field, op, value } = c as { field?: unknown; op?: unknown; value?: unknown };
    const f = typeof field === "string" ? field : undefined;
    const push = (message: string) => errors.push({ index, ...(f !== undefined ? { field: f } : {}), message });
    if (!isSafePath(field)) push("field must be a non-empty path without __proto__/prototype/constructor");
    if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) {
      push(`unknown op "${String(op)}"`);
      return;
    }
    const o = op as Op;
    if (NO_VALUE.has(o)) return;
    if (value === undefined && !OPTIONAL_VALUE.has(o)) {
      push(`${o} needs a value`);
      return;
    }
    if (STRING_OPS.has(o)) {
      if (typeof value !== "string" && typeof value !== "number") push(`${o} needs a string or number value`);
      else if (String(value).trim() === "") push(`${o} with an empty value matches everything`);
    } else if (ORDER_OPS.has(o)) {
      if (!comparable(value)) push(`${o} needs a number, numeric string, Date or ISO date string`);
    } else if (o === "between") {
      const r = Array.isArray(value) && value.length === 2
        ? value
        : value && typeof value === "object" && "min" in value && "max" in value
          ? [(value as { min: unknown }).min, (value as { max: unknown }).max]
          : null;
      if (!r) push("between needs [min, max] or { min, max }");
      else if (!comparable(r[0]) || !comparable(r[1])) push("between bounds must be numbers, Dates or ISO date strings");
      else if ((compare(r[0], r[1]) ?? 0) > 0) push("between min is greater than max");
    } else if (o === "in" || o === "notIn") {
      if (!Array.isArray(value) && typeof value !== "string") push(`${o} needs an array or a comma-separated string`);
      else if ((Array.isArray(value) ? value.length : value.trim().length) === 0) push(`${o} needs at least one value`);
    } else if (o === "regex") {
      const re = compileSafe(value, false, opts.regex ?? {});
      if (typeof re === "string") push(re);
    }
  });
  return errors;
}
