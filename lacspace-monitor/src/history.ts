/**
 * Change-history helpers — append every detected change to an NDJSON log, read
 * it back, and summarize it. `summarizeHistory` and `resultToHistory` are pure
 * and unit-tested; the append/read helpers touch disk.
 */
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import type { CheckResult, HistoryEntry } from "./types.js";

/** Turn a check result into a compact history entry. Pure. */
export function resultToHistory(r: CheckResult): HistoryEntry {
  const e: HistoryEntry = { at: r.at, id: r.id, label: r.label, url: r.url, type: r.type };
  if (r.before !== undefined) e.before = r.before;
  if (r.after !== undefined) e.after = r.after;
  if (r.added && r.added.length) e.added = r.added;
  if (r.removed && r.removed.length) e.removed = r.removed;
  if (r.condition) e.condition = r.condition;
  return e;
}

/** Append changed results to an NDJSON history log (one JSON object per line). */
export function appendHistory(file: string, results: CheckResult[]): void {
  const rows = results.filter((r) => !r.error).map((r) => JSON.stringify(resultToHistory(r)));
  if (rows.length) appendFileSync(file, rows.join("\n") + "\n");
}

/** Read an NDJSON history log back into entries (skips blank/broken lines). */
export function readHistory(file: string): HistoryEntry[] {
  if (!existsSync(file)) return [];
  const out: HistoryEntry[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as HistoryEntry); } catch { /* skip */ }
  }
  return out;
}

/** A rolled-up view of a change history. */
export interface HistorySummary {
  total: number;
  first?: string;
  last?: string;
  byLabel: { label: string; count: number; last: string }[];
  byType: Record<string, number>;
  recent: HistoryEntry[];
}

/**
 * Summarize history entries: totals, per-label and per-type counts, the busiest
 * watches first, and the most recent changes. Pure. `recent` caps the tail.
 */
export function summarizeHistory(entries: HistoryEntry[], recent = 10): HistorySummary {
  const byLabelMap = new Map<string, { count: number; last: string }>();
  const byType: Record<string, number> = {};
  for (const e of entries) {
    const cur = byLabelMap.get(e.label) ?? { count: 0, last: e.at };
    cur.count++;
    if (e.at >= cur.last) cur.last = e.at;
    byLabelMap.set(e.label, cur);
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  const byLabel = [...byLabelMap.entries()]
    .map(([label, v]) => ({ label, count: v.count, last: v.last }))
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
  const summary: HistorySummary = {
    total: entries.length,
    byLabel,
    byType,
    recent: entries.slice(-recent).reverse(),
  };
  if (entries.length) {
    summary.first = entries[0]!.at;
    summary.last = entries[entries.length - 1]!.at;
  }
  return summary;
}
