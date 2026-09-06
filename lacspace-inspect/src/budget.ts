/**
 * Performance budgets. A budget string like
 * `"html<100kb,scripts<10,images<20,requests<50"` parses into {@link Budget}
 * rules; {@link evaluateBudget} checks a report's stats against them and returns
 * a graded `budget` {@link Category} whose findings `fail` when a limit is
 * exceeded. All pure — testable on a stats object, no network.
 */
import type { Budget, Category, Finding, Report } from "./types.js";
import { makeCategory } from "./grade.js";
import { attachFixes } from "./fixes.js";

const METRICS = new Set<Budget["metric"]>([
  "html", "scripts", "stylesheets", "images", "links", "requests", "responsetime",
]);

/** Aliases so users can write natural names. */
const ALIAS: Record<string, Budget["metric"]> = {
  html: "html", htmlbytes: "html", size: "html", bytes: "html",
  scripts: "scripts", js: "scripts",
  stylesheets: "stylesheets", css: "stylesheets", styles: "stylesheets",
  images: "images", img: "images", imgs: "images",
  links: "links",
  requests: "requests", reqs: "requests",
  responsetime: "responsetime", ttfb: "responsetime", time: "responsetime",
};

/** Parse a size/number token: `100kb`, `1.5mb`, `500`, `600ms` → base units. */
function parseValue(raw: string, metric: Budget["metric"]): number | undefined {
  const m = /^([\d.]+)\s*(b|kb|mb|gb|ms|s)?$/i.exec(raw.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = (m[2] ?? "").toLowerCase();
  if (metric === "html") {
    switch (unit) {
      case "gb": return n * 1024 ** 3;
      case "mb": return n * 1024 ** 2;
      case "kb": return n * 1024;
      case "b": case "": return n; // bare number = bytes
      default: return undefined;
    }
  }
  if (metric === "responsetime") {
    return unit === "s" ? n * 1000 : n; // default ms
  }
  return unit === "" ? n : undefined; // counts take no unit
}

/**
 * Parse a budget spec into rules. Unknown metrics/units are skipped (they're
 * surfaced via {@link parseBudgetErrors} if you want to warn the user). Pure.
 */
export function parseBudget(spec: string): Budget[] {
  return parseBudgetDetailed(spec).budgets;
}

/** Parse a budget spec, returning both the valid rules and any parse errors. Pure. */
export function parseBudgetDetailed(spec: string): { budgets: Budget[]; errors: string[] } {
  const budgets: Budget[] = [];
  const errors: string[] = [];
  for (const partRaw of spec.split(/[,;]/)) {
    const part = partRaw.trim();
    if (!part) continue;
    const m = /^([a-z]+)\s*(<=|>=|<|>)\s*(.+)$/i.exec(part);
    if (!m) { errors.push(`Cannot parse budget "${part}" (expected e.g. scripts<10)`); continue; }
    const metric = ALIAS[m[1]!.toLowerCase()];
    if (!metric || !METRICS.has(metric)) { errors.push(`Unknown budget metric "${m[1]}"`); continue; }
    const op = m[2] as Budget["op"];
    const value = parseValue(m[3]!, metric);
    if (value === undefined) { errors.push(`Bad budget value "${m[3]}" for ${metric}`); continue; }
    budgets.push({ metric, op, value, raw: m[3]!.trim() });
  }
  return { budgets, errors };
}

/** The measured value for a metric from a report's stats. `requests` is an estimate. */
export function metricValue(report: Report, metric: Budget["metric"]): number | undefined {
  const s = report.stats;
  switch (metric) {
    case "html": return s.htmlBytes;
    case "scripts": return s.scripts;
    case "stylesheets": return s.stylesheets;
    case "images": return s.images;
    case "links": return s.internalLinks + s.externalLinks;
    case "requests": return s.scripts + s.stylesheets + s.images; // rough subresource estimate
    case "responsetime": return s.responseTimeMs;
  }
}

function satisfies(actual: number, op: Budget["op"], limit: number): boolean {
  switch (op) {
    case "<": return actual < limit;
    case "<=": return actual <= limit;
    case ">": return actual > limit;
    case ">=": return actual >= limit;
  }
}

function fmt(metric: Budget["metric"], v: number): string {
  if (metric === "html") return v >= 1024 ? `${(v / 1024).toFixed(1)} KB` : `${v} B`;
  if (metric === "responsetime") return `${v} ms`;
  return String(v);
}

/**
 * Evaluate budgets against a report → a graded `budget` {@link Category}. Each
 * rule is a finding: `ok` when satisfied, `fail` when exceeded, `info` when the
 * metric wasn't measured. The category `weight` is 0 so budgets never change the
 * overall grade — they're a separate pass/fail gate. Pure.
 */
export function evaluateBudget(report: Report, budgets: Budget[]): Category {
  const findings: Finding[] = [];
  for (const b of budgets) {
    const actual = metricValue(report, b.metric);
    if (actual === undefined) {
      findings.push({ id: `budget.${b.metric}`, status: "info", message: `${b.metric} not measured — budget ${b.op}${b.raw} skipped` });
      continue;
    }
    const pass = satisfies(actual, b.op, b.value);
    findings.push(pass
      ? { id: `budget.${b.metric}`, status: "ok", message: `${b.metric} ${fmt(b.metric, actual)} ${pass ? "meets" : "over"} budget (${b.op} ${fmt(b.metric, b.value)})` }
      : { id: `budget.${b.metric}`, status: "fail", message: `${b.metric} ${fmt(b.metric, actual)} exceeds budget (${b.op} ${fmt(b.metric, b.value)})` });
  }
  if (findings.length === 0) {
    findings.push({ id: "budget.none", status: "info", message: "No valid budget rules" });
  }
  attachFixes(findings);
  return makeCategory("budget", "Budgets", 0, findings);
}

/** True if any budget finding failed. Pure. */
export function budgetExceeded(cat: Category): boolean {
  return cat.findings.some((f) => f.status === "fail");
}
