/**
 * Filter a HAR down to the entries matching a query, so the whole report
 * (totals, breakdowns, waterfall, recommendations) can focus on a subset.
 * Query grammar (comma-separated AND clauses):
 *   domain=cdn.x   type=image   status>=400   size>100kb   url~=/api/   method=POST
 * Pure — returns a new {@link Har} sharing untouched log metadata.
 */
import type { Har, HarEntry, FilterOp, FilterRule } from "./types.js";
import { categoryOf, hostOf, registrableDomain, transferBytes } from "./analyze.js";

/** Parse a byte size like `100kb`, `2mb`, `512` (bytes). Returns NaN on garbage. */
export function parseSize(s: string): number {
  const m = /^\s*([\d.]+)\s*(b|kb|mb|gb)?\s*$/i.exec(s);
  if (!m) return NaN;
  const n = parseFloat(m[1]!);
  const unit = (m[2] ?? "b").toLowerCase();
  const mult = unit === "gb" ? 1024 ** 3 : unit === "mb" ? 1024 ** 2 : unit === "kb" ? 1024 : 1;
  return n * mult;
}

const OPS: FilterOp[] = [">=", "<=", "!=", "~=", "=", ">", "<"];

/** Parse a filter query string into {@link FilterRule}s. Unknown fields throw. */
export function parseFilter(query: string): FilterRule[] {
  const rules: FilterRule[] = [];
  for (const raw of query.split(",")) {
    const clause = raw.trim();
    if (!clause) continue;
    let op: FilterOp | undefined;
    let idx = -1;
    for (const candidate of OPS) {
      const at = clause.indexOf(candidate);
      if (at > 0) { op = candidate; idx = at; break; }
    }
    if (!op || idx < 0) throw new Error(`Bad filter clause: "${clause}" (expected field<op>value)`);
    const field = clause.slice(0, idx).trim().toLowerCase();
    const value = clause.slice(idx + op.length).trim();
    if (!["domain", "type", "status", "size", "url", "method"].includes(field)) {
      throw new Error(`Unknown filter field: "${field}"`);
    }
    const rule: FilterRule = { field: field as FilterRule["field"], op, value };
    if (field === "status") rule.num = parseInt(value, 10);
    if (field === "size") rule.num = parseSize(value);
    rules.push(rule);
  }
  return rules;
}

function cmpNum(a: number, op: FilterOp, b: number): boolean {
  switch (op) {
    case "=": return a === b;
    case "!=": return a !== b;
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case "~=": return String(a).includes(String(b));
  }
}

function cmpStr(a: string, op: FilterOp, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  switch (op) {
    case "=": return la === lb;
    case "!=": return la !== lb;
    case "~=": return la.includes(lb);
    default: return la.includes(lb); // >,<,>= on strings degrade to "contains"
  }
}

/** Does a single entry satisfy one rule? */
export function matchRule(e: HarEntry, rule: FilterRule): boolean {
  switch (rule.field) {
    case "status":
      return Number.isFinite(rule.num!) && cmpNum(e.response.status ?? 0, rule.op, rule.num!);
    case "size":
      return Number.isFinite(rule.num!) && cmpNum(transferBytes(e), rule.op, rule.num!);
    case "type":
      return cmpStr(categoryOf(e), rule.op, rule.value);
    case "method":
      return cmpStr(e.request.method ?? "GET", rule.op, rule.value);
    case "url":
      return cmpStr(e.request.url ?? "", rule.op, rule.value);
    case "domain": {
      const host = hostOf(e.request.url);
      // Match either the full host or its registrable domain.
      return cmpStr(host, rule.op, rule.value) || cmpStr(registrableDomain(host), rule.op, rule.value);
    }
  }
}

/**
 * Return a new HAR keeping only entries that match ALL rules. Accepts a query
 * string or pre-parsed rules.
 */
export function filterEntries(har: Har, filter: string | FilterRule[]): Har {
  const rules = typeof filter === "string" ? parseFilter(filter) : filter;
  const entries = (har.log.entries ?? []).filter((e) => rules.every((r) => matchRule(e, r)));
  return { ...har, log: { ...har.log, entries } };
}
