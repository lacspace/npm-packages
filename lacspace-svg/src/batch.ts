/**
 * Batch optimization: run {@link optimize} over many SVGs and aggregate the
 * per-file and total byte savings. Pure and side-effect free — the CLI reads
 * files and hands their contents in.
 */

import type { OptimizeOptions } from "./optimize.js";
import { optimize } from "./optimize.js";

/** One file's optimization outcome. */
export interface BatchFileResult {
  path: string;
  before: number;
  after: number;
  saved: number;
  savedPct: number;
  data: string;
}

/** Aggregate totals across every file in a batch. */
export interface BatchTotals {
  count: number;
  before: number;
  after: number;
  saved: number;
  /** Percent saved across all files, 0–100, one decimal. */
  savedPct: number;
}

/** Result of {@link batchOptimize}: per-file results plus totals. */
export interface BatchResult {
  files: BatchFileResult[];
  total: BatchTotals;
}

/** Optimize a set of `{ path, content }` inputs and aggregate the savings. */
export function batchOptimize(
  inputs: { path: string; content: string }[],
  opts: OptimizeOptions = {},
): BatchResult {
  const files: BatchFileResult[] = inputs.map(({ path, content }) => {
    const r = optimize(content, opts);
    return { path, before: r.before, after: r.after, saved: r.saved, savedPct: r.savedPct, data: r.data };
  });
  const before = files.reduce((s, f) => s + f.before, 0);
  const after = files.reduce((s, f) => s + f.after, 0);
  const saved = before - after;
  const savedPct = before === 0 ? 0 : Math.round((saved / before) * 1000) / 10;
  return { files, total: { count: files.length, before, after, saved, savedPct } };
}
