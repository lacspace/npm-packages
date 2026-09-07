/**
 * Size budgets: parse `pattern:size` specs, match files, and decide pass/fail.
 * A budget sums the chosen metric across every file matching its glob and
 * compares that against the limit. Any failure should gate CI (exit non-zero).
 */
import { parseSize } from "./humansize.js";
import { matchGlob } from "./walk.js";
import { pick } from "./analyze.js";
import type { FileMeasure } from "./measure.js";
import type { Metric } from "./analyze.js";

export interface Budget {
  /** Glob the budget applies to; `*` / `**` means "everything" (the total). */
  pattern: string;
  /** Limit in bytes. */
  max: number;
}

/**
 * Parse a `"<pattern>:<size>"` budget spec, e.g. `"*.js:200kb"`.
 * The size portion is the substring after the LAST colon (so Windows-y or
 * URL-ish patterns still work). A bare size (no colon) becomes a `**` budget.
 */
export function parseBudgetSpec(spec: string): Budget {
  const idx = spec.lastIndexOf(":");
  if (idx === -1) {
    return { pattern: "**", max: parseSize(spec.trim()) };
  }
  const pattern = spec.slice(0, idx).trim() || "**";
  const size = spec.slice(idx + 1).trim();
  return { pattern, max: parseSize(size) };
}

/** True when a file path is covered by a budget's pattern. */
export function fileMatchesBudget(pattern: string, path: string): boolean {
  if (pattern === "*" || pattern === "**") return true;
  if (matchGlob(pattern, path)) return true;
  // A slash-less pattern (e.g. `*.js`) also matches on basename anywhere.
  if (!pattern.includes("/")) {
    const base = path.split("/").pop() ?? path;
    if (matchGlob(pattern, base)) return true;
  }
  return false;
}

export interface BudgetResult {
  pattern: string;
  max: number;
  /** Summed metric across matching files. */
  actual: number;
  /** Which metric was compared. */
  metric: Metric;
  /** How many files matched. */
  matched: number;
  /** actual <= max. */
  ok: boolean;
  /** actual - max (positive means over budget). */
  over: number;
}

/** Evaluate one budget against the measured files. */
export function evaluateBudget(budget: Budget, files: FileMeasure[], metric: Metric): BudgetResult {
  let actual = 0;
  let matched = 0;
  for (const f of files) {
    if (fileMatchesBudget(budget.pattern, f.path)) {
      actual += pick(f, metric);
      matched++;
    }
  }
  return {
    pattern: budget.pattern,
    max: budget.max,
    actual,
    metric,
    matched,
    ok: actual <= budget.max,
    over: actual - budget.max,
  };
}

/** Evaluate a set of budgets; returns one result per budget. */
export function evaluateBudgets(budgets: Budget[], files: FileMeasure[], metric: Metric): BudgetResult[] {
  return budgets.map((b) => evaluateBudget(b, files, metric));
}

/** True when every budget passed (or there were none). */
export function budgetsPass(results: BudgetResult[]): boolean {
  return results.every((r) => r.ok);
}
