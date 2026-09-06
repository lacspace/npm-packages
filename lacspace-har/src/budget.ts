/**
 * Performance budgets / CI gate. Parse a budget spec, check it against an
 * analyzed report, and report clear pass/fail per metric. Pure — the CLI turns
 * a failing {@link BudgetResult} into a non-zero exit code.
 * Spec grammar (comma-separated): `js<300kb,images<500kb,requests<50,thirdparty<20,total<2mb`
 */
import type { BudgetKey, BudgetResult, BudgetRule, HarReport, ResourceCategory } from "./types.js";
import { fmtBytes } from "./analyze.js";
import { parseSize } from "./filter.js";

const KEYS: BudgetKey[] = ["js", "css", "images", "fonts", "document", "xhr", "other", "requests", "thirdparty", "total"];
const COUNT_KEYS = new Set<BudgetKey>(["requests", "thirdparty"]);

/** Map a budget key to the type category it sums (size keys only). */
const KEY_CATEGORY: Partial<Record<BudgetKey, ResourceCategory>> = {
  js: "script",
  css: "css",
  images: "image",
  fonts: "font",
  document: "document",
  xhr: "xhr-fetch",
  other: "other",
};

/** Parse a budget spec string into rules. Unknown keys throw with guidance. */
export function parseBudget(spec: string): BudgetRule[] {
  const rules: BudgetRule[] = [];
  for (const raw of spec.split(",")) {
    const clause = raw.trim();
    if (!clause) continue;
    const m = /^([a-z]+)\s*(<=|>=|<|>)\s*(.+)$/i.exec(clause);
    if (!m) throw new Error(`Bad budget clause: "${clause}" (expected key<value, e.g. js<300kb)`);
    const key = m[1]!.toLowerCase() as BudgetKey;
    if (!KEYS.includes(key)) {
      throw new Error(`Unknown budget key "${key}". Known: ${KEYS.join(", ")}`);
    }
    const op = m[2] as BudgetRule["op"];
    const unit = COUNT_KEYS.has(key) ? "count" : "bytes";
    const limit = unit === "count" ? parseInt(m[3]!, 10) : parseSize(m[3]!);
    if (!Number.isFinite(limit)) throw new Error(`Bad budget value in "${clause}"`);
    rules.push({ key, op, limit, unit, raw: clause });
  }
  return rules;
}

/** The actual measured value for a budget key from a report. */
export function actualFor(report: HarReport, key: BudgetKey): number {
  if (key === "requests") return report.totals.requests;
  if (key === "total") return report.totals.transferBytes;
  if (key === "thirdparty") {
    // Number of third-party requests (sum of counts on third-party domains).
    return report.byDomain.filter((d) => d.thirdParty).reduce((s, d) => s + d.count, 0);
  }
  const cat = KEY_CATEGORY[key];
  const t = report.byType.find((x) => x.category === cat);
  return t ? t.bytes : 0;
}

function within(actual: number, op: BudgetRule["op"], limit: number): boolean {
  switch (op) {
    case "<": return actual < limit;
    case "<=": return actual <= limit;
    case ">": return actual > limit;
    case ">=": return actual >= limit;
  }
}

/**
 * Check a report against a budget spec (string or pre-parsed rules).
 * `result.pass` is false when any rule is violated.
 */
export function budgetCheck(report: HarReport, budget: string | BudgetRule[]): BudgetResult {
  const rules = typeof budget === "string" ? parseBudget(budget) : budget;
  const items = rules.map((rule) => {
    const actual = actualFor(report, rule.key);
    const pass = within(actual, rule.op, rule.limit);
    const fmt = (n: number): string => (rule.unit === "bytes" ? fmtBytes(n) : String(n));
    const label = `${rule.key} ${actual === rule.limit ? "=" : actual > rule.limit ? ">" : "<"} ${fmt(rule.limit)} — is ${fmt(actual)}`;
    return { rule, actual, pass, label };
  });
  return { pass: items.every((i) => i.pass), items };
}
