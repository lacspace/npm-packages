/**
 * A tiny request benchmark: send the same request N times and summarise the
 * timings (min / mean / median / p95 / p99 / max / stdev). The statistics
 * aggregator {@link summarizeTimings} is pure and unit-tested; {@link runBenchmark}
 * just drives {@link sendRequest} with an injectable `fetchImpl`, so nothing here
 * touches the real network in a test.
 */
import { sendRequest } from "./request.js";
import type { RequestSpec, ResponseRecord, SendOptions } from "./request.js";

/** Summary statistics over a set of timing samples (all in ms). */
export interface BenchStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdev: number;
  total: number;
}

/** Nearest-rank percentile over an already-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}

/** Aggregate a set of timing samples into summary statistics. Pure. */
export function summarizeTimings(samples: number[]): BenchStats {
  const n = samples.length;
  if (n === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdev: 0, total: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((s, x) => s + x, 0);
  const mean = total / n;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const median = n % 2
    ? sorted[(n - 1) / 2]!
    : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  return {
    count: n,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    mean,
    median,
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stdev: Math.sqrt(variance),
    total,
  };
}

/** Options for {@link runBenchmark}. */
export interface BenchOptions extends SendOptions {
  /** How many times to send the request (default 1). */
  repeat?: number;
  /** Called after each iteration, e.g. to draw a progress dot. */
  onSample?: (i: number, timeMs: number, status: number) => void;
  /** Keep every successful {@link ResponseRecord} (e.g. for a HAR export). */
  keepRecords?: boolean;
}

/** The outcome of a benchmark run. */
export interface BenchOutcome {
  stats: BenchStats;
  /** Per-iteration timings in send order (ms). */
  samples: number[];
  /** Status-code → count histogram. */
  statuses: Record<number, number>;
  /** Count of iterations that threw (network error / timeout). */
  errors: number;
  /** Count of iterations with a 2xx status. */
  ok: number;
  /** Every response record, if `keepRecords` was set. */
  records?: ResponseRecord[];
}

/** Send a request `repeat` times and summarise. Uses `opts.fetchImpl` if given. */
export async function runBenchmark(spec: RequestSpec, opts: BenchOptions = {}): Promise<BenchOutcome> {
  const repeat = Math.max(1, Math.floor(opts.repeat ?? 1));
  const sendOpts: SendOptions = {};
  if (opts.timeoutMs !== undefined) sendOpts.timeoutMs = opts.timeoutMs;
  if (opts.maxSize !== undefined) sendOpts.maxSize = opts.maxSize;
  if (opts.maxRedirects !== undefined) sendOpts.maxRedirects = opts.maxRedirects;
  if (opts.followRedirects !== undefined) sendOpts.followRedirects = opts.followRedirects;
  if (opts.fetchImpl !== undefined) sendOpts.fetchImpl = opts.fetchImpl;
  if (opts.retry !== undefined) sendOpts.retry = opts.retry;
  if (opts.sleepImpl !== undefined) sendOpts.sleepImpl = opts.sleepImpl;

  const samples: number[] = [];
  const statuses: Record<number, number> = {};
  const records: ResponseRecord[] = [];
  let errors = 0;
  let ok = 0;

  for (let i = 0; i < repeat; i++) {
    try {
      const rec = await sendRequest(spec, sendOpts);
      samples.push(rec.timeMs);
      statuses[rec.status] = (statuses[rec.status] ?? 0) + 1;
      if (rec.ok) ok++;
      if (opts.keepRecords) records.push(rec);
      opts.onSample?.(i, rec.timeMs, rec.status);
    } catch {
      errors++;
      opts.onSample?.(i, 0, 0);
    }
  }

  const outcome: BenchOutcome = { stats: summarizeTimings(samples), samples, statuses, errors, ok };
  if (opts.keepRecords) outcome.records = records;
  return outcome;
}
