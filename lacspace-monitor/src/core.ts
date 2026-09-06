/**
 * Pure change-monitoring helpers — a stable hash, JSON path access, feed-item
 * extraction, watch-type inference and snapshot diffing. All exported and
 * unit-tested; no network or disk here.
 */
import type { Snapshot, Watch, WatchType } from "./types.js";

/** A stable, fast 53-bit hash of a string, as hex. Pure. (cyrb53) */
export function hashValue(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

/** Read a dot/bracket path (`a.b.0.c` or `a[0].c`) out of a value. Pure. */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.replace(/\[(\w+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(p)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

/** Coerce any value to the string we snapshot/compare. Pure. */
export function toValueString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Extract stable item ids from an RSS/Atom XML string or a JSON Feed. Prefers
 * guid/id, falls back to link/url, then title. Pure.
 */
export function feedItemIds(body: string): string[] {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as { items?: { id?: string; url?: string; title?: string }[] };
      return (json.items ?? []).map((it) => it.id || it.url || it.title || "").filter(Boolean);
    } catch {
      return [];
    }
  }
  const ids: string[] = [];
  const blocks = body.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const guid = block.match(/<guid[^>]*>\s*([\s\S]*?)\s*<\/guid>/i)?.[1];
    const id = block.match(/<id[^>]*>\s*([\s\S]*?)\s*<\/id>/i)?.[1];
    const linkHref = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const linkText = block.match(/<link[^>]*>\s*([\s\S]*?)\s*<\/link>/i)?.[1];
    const title = block.match(/<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i)?.[1];
    const raw = (guid || id || linkHref || linkText || title || "").trim();
    if (raw) ids.push(raw.replace(/<!\[CDATA\[|\]\]>/g, "").trim());
  }
  return ids;
}

/** Infer a watch's type from its fields. Pure. */
export function inferType(watch: Watch): WatchType {
  if (watch.type) return watch.type;
  if (watch.path) return "json";
  if (watch.header) return "header";
  if (watch.contains != null || watch.absent != null || watch.match != null) return "content";
  if (watch.selector) return "selector";
  return "page";
}

/** A stable id for a watch when none is given. Pure. */
export function watchId(watch: Watch): string {
  if (watch.id) return watch.id;
  const key = [
    inferType(watch), watch.url, watch.selector ?? "", watch.attr ?? "", watch.path ?? "",
    watch.header ?? "", watch.contains ?? "", watch.absent ?? "", watch.match ?? "",
  ].join("|");
  return hashValue(key);
}

/** Build a snapshot from a scalar value. */
export function snapshotValue(value: string): Snapshot {
  return { hash: hashValue(value), value, at: new Date().toISOString() };
}

/** Build a snapshot from feed item ids. */
export function snapshotItems(items: string[]): Snapshot {
  return { hash: hashValue(items.join("\n")), items, at: new Date().toISOString() };
}

/**
 * Retain a small ring of prior values on the next snapshot (newest last), so a
 * watch keeps a short trend history in the state file. Pure. `keep` caps size.
 */
export function retainHistory(prev: Snapshot | undefined, next: Snapshot, keep = 5): Snapshot {
  if (keep <= 0 || next.value === undefined) return next;
  const prior = prev?.history ?? [];
  const carried = prev && prev.value !== undefined ? [...prior, { at: prev.at, value: prev.value }] : prior;
  const history = carried.slice(-keep);
  return history.length ? { ...next, history } : next;
}

// ── Condition evaluator ──────────────────────────────────────────────────────

/** The operators a `--when` condition can use. */
export type ConditionOp =
  | "increased" | "decreased" | "changed"
  | "contains" | "not-contains" | "matches"
  | "gt" | "lt" | "gte" | "lte" | "eq" | "ne";

/** A parsed `--when` condition. */
export interface Condition {
  op: ConditionOp;
  /** The string argument (contains/matches/eq/ne). */
  arg?: string;
  /** The numeric argument (thresholds), when the arg parses as a number. */
  num?: number;
  /** The original source string, for reports. */
  source: string;
}

/**
 * Pull the first number out of a value, tolerating currency/thousands/units:
 * `"$1,299.00"` → `1299`, `"12.5%"` → `12.5`, `"v2"` → `2`. Pure.
 */
export function parseNumeric(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

const CMP: Record<string, ConditionOp> = { ">=": "gte", "<=": "lte", ">": "gt", "<": "lt", "==": "eq", "!=": "ne" };

/**
 * Parse a `--when` condition string. Throws a helpful error on nonsense. Pure.
 * Examples: `increased`, `decreased`, `changed`, `contains:sale`,
 * `not-contains:error`, `matches:^v2`, `>100`, `<=14`, `==200`, `!=active`.
 */
export function parseCondition(input: string): Condition {
  const s = input.trim();
  if (!s) throw new Error("Empty --when condition.");
  if (s === "increased" || s === "decreased" || s === "changed") return { op: s, source: s };
  for (const [prefix, op] of [["not-contains:", "not-contains"], ["contains:", "contains"], ["matches:", "matches"]] as const) {
    if (s.toLowerCase().startsWith(prefix)) {
      const arg = s.slice(prefix.length);
      if (op === "matches") { try { new RegExp(arg); } catch { throw new Error(`Invalid regex in --when: ${arg}`); } }
      return { op, arg, source: s };
    }
  }
  const m = /^(>=|<=|==|!=|>|<)\s*(.+)$/.exec(s);
  if (m) {
    const op = CMP[m[1]!]!;
    const arg = m[2]!.trim();
    const num = parseNumeric(arg);
    return num !== undefined ? { op, arg, num, source: s } : { op, arg, source: s };
  }
  throw new Error(
    `Unrecognized --when condition "${input}". Use increased | decreased | changed | ` +
      `contains:<s> | not-contains:<s> | matches:<regex> | >N | <N | >=N | <=N | ==<v> | !=<v>.`,
  );
}

/** The values a condition is evaluated against. */
export interface ConditionContext {
  before?: string;
  after?: string;
  changed: boolean;
  baseline?: boolean;
}

/**
 * Evaluate a parsed condition against a check's before/after values. Pure.
 *
 * Change conditions (`increased`/`decreased`/`changed`) never fire on a baseline
 * and need the value to move. Value conditions (`contains`, `matches`, `>N`, …)
 * fire whenever the current value satisfies them.
 */
export function evalCondition(cond: Condition, ctx: ConditionContext): boolean {
  const after = ctx.after ?? "";
  const before = ctx.before ?? "";
  switch (cond.op) {
    case "changed":
      return ctx.changed;
    case "increased": {
      const a = parseNumeric(after), b = parseNumeric(before);
      return a !== undefined && b !== undefined && a > b;
    }
    case "decreased": {
      const a = parseNumeric(after), b = parseNumeric(before);
      return a !== undefined && b !== undefined && a < b;
    }
    case "contains":
      return after.includes(cond.arg ?? "");
    case "not-contains":
      return !after.includes(cond.arg ?? "");
    case "matches":
      try { return new RegExp(cond.arg ?? "").test(after); } catch { return false; }
    case "gt": case "lt": case "gte": case "lte": {
      const a = parseNumeric(after);
      if (a === undefined || cond.num === undefined) return false;
      return cond.op === "gt" ? a > cond.num : cond.op === "lt" ? a < cond.num
        : cond.op === "gte" ? a >= cond.num : a <= cond.num;
    }
    case "eq": {
      if (after === cond.arg) return true;
      const a = parseNumeric(after);
      return cond.num !== undefined && a !== undefined && a === cond.num;
    }
    case "ne": {
      if (cond.num !== undefined) { const a = parseNumeric(after); return !(a !== undefined && a === cond.num); }
      return after !== cond.arg;
    }
  }
}

/**
 * One call to gate an alert. Returns `changed` when no condition string is set
 * (backward-compatible), otherwise the parsed condition's verdict. Pure.
 */
export function evalWhen(when: string | undefined, ctx: ConditionContext): boolean {
  if (!when) return ctx.changed;
  return evalCondition(parseCondition(when), ctx);
}

// ── Richer diffs ─────────────────────────────────────────────────────────────

/** One line/word in a diff. */
export interface DiffOp { type: "same" | "add" | "del"; value: string }

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", value: a[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { out.push({ type: "del", value: a[i]! }); i++; }
    else { out.push({ type: "add", value: b[j]! }); j++; }
  }
  while (i < n) out.push({ type: "del", value: a[i++]! });
  while (j < m) out.push({ type: "add", value: b[j++]! });
  return out;
}

/** Line-level diff of two texts. Pure. */
export function lineDiff(before: string, after: string): DiffOp[] {
  return lcsDiff(before.split("\n"), after.split("\n"));
}

/** Word-level diff of two texts. Pure. */
export function wordDiff(before: string, after: string): DiffOp[] {
  return lcsDiff(before.split(/\s+/).filter(Boolean), after.split(/\s+/).filter(Boolean));
}

/** One JSON path that differs between two documents. */
export interface JsonChange { path: string; kind: "added" | "removed" | "changed"; before?: unknown; after?: unknown }

function walkJson(a: unknown, b: unknown, path: string, out: JsonChange[]): void {
  if (a === b) return;
  const bothObj = a && b && typeof a === "object" && typeof b === "object";
  if (bothObj) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      const av = (a as Record<string, unknown>)[k], bv = (b as Record<string, unknown>)[k];
      const p = path ? `${path}.${k}` : k;
      if (!(k in (a as object))) out.push({ path: p, kind: "added", after: bv });
      else if (!(k in (b as object))) out.push({ path: p, kind: "removed", before: av });
      else walkJson(av, bv, p, out);
    }
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: path || "$", kind: "changed", before: a, after: b });
}

/** Path-level diff of two JSON strings (or values). Pure; safe on invalid JSON. */
export function jsonDiff(before: string, after: string): JsonChange[] {
  let a: unknown, b: unknown;
  try { a = JSON.parse(before); } catch { a = before; }
  try { b = JSON.parse(after); } catch { b = after; }
  const out: JsonChange[] = [];
  walkJson(a, b, "", out);
  return out;
}

// ── TLS / SSL expiry ─────────────────────────────────────────────────────────

/**
 * Whole days from `now` until a certificate's `notAfter`. Pure — pass a fixed
 * date to test. Accepts a `Date` or any string `Date` can parse (incl. the
 * OpenSSL `valid_to` form, e.g. `"Aug 10 12:00:00 2027 GMT"`). Negative = expired.
 */
export function sslDaysUntil(notAfter: Date | string, now: Date = new Date()): number {
  const end = notAfter instanceof Date ? notAfter : new Date(notAfter);
  const ms = end.getTime() - now.getTime();
  return Math.floor(ms / 86400000);
}

/** Diff two snapshots. Pure. `type === "feed"` compares item sets. */
export function diffSnapshots(
  prev: Snapshot | undefined,
  next: Snapshot,
  type: WatchType,
): { changed: boolean; before?: string; after?: string; added?: string[]; removed?: string[] } {
  if (!prev) return { changed: false };
  if (type === "feed") {
    const prevSet = new Set(prev.items ?? []);
    const nextSet = new Set(next.items ?? []);
    const added = (next.items ?? []).filter((i) => !prevSet.has(i));
    const removed = (prev.items ?? []).filter((i) => !nextSet.has(i));
    return { changed: added.length > 0 || removed.length > 0, added, removed };
  }
  const changed = prev.hash !== next.hash;
  const out: { changed: boolean; before?: string; after?: string } = { changed };
  if (changed) { out.before = prev.value ?? ""; out.after = next.value ?? ""; }
  return out;
}
