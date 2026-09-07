/**
 * The core analyze engine: resolve inputs to files, measure each, and roll the
 * results up into totals and a per-extension breakdown.
 */
import { join } from "node:path";
import { measureFile } from "./measure.js";
import type { FileMeasure, MeasureOptions, Sizes } from "./measure.js";
import { resolveInputs } from "./walk.js";
import type { WalkOptions } from "./walk.js";

export type Metric = "raw" | "gzip" | "brotli";

export interface AnalyzeOptions extends MeasureOptions, WalkOptions {
  /** Base directory the inputs are resolved against. Default `process.cwd()`. */
  cwd?: string;
}

/** Aggregate size totals across all measured files. */
export interface Totals extends Sizes {
  /** Number of files measured. */
  files: number;
}

/** One row of the by-extension rollup. */
export interface ExtRollup extends Sizes {
  /** File extension including the dot (`.js`), or `(none)`. */
  ext: string;
  /** How many files carry this extension. */
  count: number;
}

export interface AnalyzeResult {
  files: FileMeasure[];
  total: Totals;
  byExtension: ExtRollup[];
  /** Whether brotli sizes were computed (drives report column visibility). */
  withBrotli: boolean;
  /** Whether gzip sizes were computed. */
  withGzip: boolean;
}

/** Pick a single metric value from a Sizes object. */
export function pick(s: Sizes, metric: Metric): number {
  return s[metric];
}

/** Extract the lowercased extension (with dot) from a path, or `(none)`. */
export function extOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "(none)"; // no dot, or a dotfile like `.env`
  return base.slice(dot).toLowerCase();
}

/** Group measured files by extension, summing sizes, largest-first by raw. */
export function rollupByExtension(files: FileMeasure[]): ExtRollup[] {
  const map = new Map<string, ExtRollup>();
  for (const f of files) {
    const ext = extOf(f.path);
    let row = map.get(ext);
    if (!row) {
      row = { ext, count: 0, raw: 0, gzip: 0, brotli: 0 };
      map.set(ext, row);
    }
    row.count++;
    row.raw += f.raw;
    row.gzip += f.gzip;
    row.brotli += f.brotli;
  }
  return [...map.values()].sort((a, b) => b.raw - a.raw);
}

/** Sum a list of measured files into totals. */
export function sumTotals(files: FileMeasure[]): Totals {
  const t: Totals = { files: files.length, raw: 0, gzip: 0, brotli: 0 };
  for (const f of files) {
    t.raw += f.raw;
    t.gzip += f.gzip;
    t.brotli += f.brotli;
  }
  return t;
}

/**
 * Resolve inputs, measure every file, and roll up. Files are returned sorted
 * largest-first by raw size.
 */
export function analyze(inputs: string[], opts: AnalyzeOptions = {}): AnalyzeResult {
  const cwd = opts.cwd ?? process.cwd();
  const paths = resolveInputs(inputs, cwd, opts);
  const withGzip = opts.gzip ?? true;
  const withBrotli = opts.brotli ?? true;
  const files: FileMeasure[] = [];
  for (const rel of paths) {
    files.push(measureFile(join(cwd, rel), rel, opts));
  }
  files.sort((a, b) => b.raw - a.raw);
  return {
    files,
    total: sumTotals(files),
    byExtension: rollupByExtension(files),
    withBrotli,
    withGzip,
  };
}
