/**
 * Baselines: snapshot a run to JSON, then diff a later run against it to catch
 * size regressions (added / removed / grew / shrank files + total delta).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseSize } from "./humansize.js";
import { pick } from "./analyze.js";
import type { AnalyzeResult, Metric, Totals } from "./analyze.js";
import type { Sizes } from "./measure.js";

export interface Baseline {
  /** Schema marker. */
  tool: "lacspace-size";
  version: 1;
  createdAt: string;
  total: Sizes & { files: number };
  /** Per-file sizes keyed by reported path. */
  files: Record<string, Sizes>;
}

/** Build a baseline snapshot from an analyze result. */
export function buildBaseline(result: AnalyzeResult): Baseline {
  const files: Record<string, Sizes> = {};
  for (const f of result.files) {
    files[f.path] = { raw: f.raw, gzip: f.gzip, brotli: f.brotli };
  }
  return {
    tool: "lacspace-size",
    version: 1,
    createdAt: new Date().toISOString(),
    total: { files: result.total.files, raw: result.total.raw, gzip: result.total.gzip, brotli: result.total.brotli },
    files,
  };
}

/** Serialize a baseline to pretty JSON. */
export function serializeBaseline(b: Baseline): string {
  return JSON.stringify(b, null, 2) + "\n";
}

/** Write a baseline snapshot to disk. */
export function saveBaseline(path: string, result: AnalyzeResult): Baseline {
  const b = buildBaseline(result);
  writeFileSync(path, serializeBaseline(b));
  return b;
}

/** Load and validate a baseline JSON file. */
export function loadBaseline(path: string): Baseline {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return validateBaseline(parsed);
}

/** Validate a parsed object is a well-formed baseline. */
export function validateBaseline(parsed: unknown): Baseline {
  if (!parsed || typeof parsed !== "object") throw new Error("Baseline is not an object");
  const b = parsed as Partial<Baseline>;
  if (b.tool !== "lacspace-size") throw new Error("Not a lacspace-size baseline file");
  if (!b.files || typeof b.files !== "object") throw new Error("Baseline is missing a files map");
  if (!b.total || typeof b.total !== "object") throw new Error("Baseline is missing totals");
  return b as Baseline;
}

export type DeltaStatus = "added" | "removed" | "grew" | "shrank" | "same";

export interface FileDelta {
  path: string;
  status: DeltaStatus;
  /** Metric value in the baseline (0 for added). */
  before: number;
  /** Metric value now (0 for removed). */
  after: number;
  /** after - before. */
  delta: number;
}

export interface DiffResult {
  metric: Metric;
  before: number;
  after: number;
  delta: number;
  /** Percentage change vs baseline total; 0 when baseline total was 0. */
  percent: number;
  added: FileDelta[];
  removed: FileDelta[];
  grew: FileDelta[];
  shrank: FileDelta[];
  /** Every per-file delta, sorted by |delta| descending. */
  files: FileDelta[];
}

/** Diff a current analyze result against a saved baseline for one metric. */
export function diffBaseline(current: AnalyzeResult, baseline: Baseline, metric: Metric): DiffResult {
  const curMap = new Map<string, number>();
  for (const f of current.files) curMap.set(f.path, pick(f, metric));

  const baseMap = new Map<string, number>();
  for (const [path, sizes] of Object.entries(baseline.files)) {
    baseMap.set(path, pickSizes(sizes, metric));
  }

  const paths = new Set<string>([...curMap.keys(), ...baseMap.keys()]);
  const files: FileDelta[] = [];
  for (const path of paths) {
    const before = baseMap.get(path);
    const after = curMap.get(path);
    let status: DeltaStatus;
    if (before === undefined) status = "added";
    else if (after === undefined) status = "removed";
    else if (after > before) status = "grew";
    else if (after < before) status = "shrank";
    else status = "same";
    const b = before ?? 0;
    const a = after ?? 0;
    files.push({ path, status, before: b, after: a, delta: a - b });
  }
  files.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const beforeTotal = pickTotals(baseline.total, metric);
  const afterTotal = pick(current.total, metric);
  const delta = afterTotal - beforeTotal;
  const percent = beforeTotal === 0 ? 0 : (delta / beforeTotal) * 100;

  return {
    metric,
    before: beforeTotal,
    after: afterTotal,
    delta,
    percent,
    added: files.filter((f) => f.status === "added"),
    removed: files.filter((f) => f.status === "removed"),
    grew: files.filter((f) => f.status === "grew"),
    shrank: files.filter((f) => f.status === "shrank"),
    files,
  };
}

/**
 * Decide whether a diff breaches a max-increase threshold.
 * `threshold` is either a byte size (absolute total delta) or a `"N%"` string
 * (percentage of baseline total). Returns true when the run should FAIL.
 * A drop in size never fails.
 */
export function exceedsMaxIncrease(diff: DiffResult, threshold: { kind: "bytes" | "percent"; value: number }): boolean {
  if (diff.delta <= 0) return false;
  if (threshold.kind === "percent") return diff.percent > threshold.value;
  return diff.delta > threshold.value;
}

/** The parsed form of a `--max-increase` threshold. */
export interface IncreaseThreshold {
  kind: "bytes" | "percent";
  value: number;
}

/** Parse a `--max-increase` value: `"10%"` (percent) or a size like `"5kb"`. */
export function parseMaxIncrease(input: string): IncreaseThreshold {
  const raw = input.trim();
  if (raw.endsWith("%")) {
    const value = Number(raw.slice(0, -1).trim());
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid percentage: "${input}"`);
    return { kind: "percent", value };
  }
  return { kind: "bytes", value: parseSize(raw) };
}

function pickSizes(s: Sizes, metric: Metric): number {
  return s[metric] ?? 0;
}
function pickTotals(t: Totals | (Sizes & { files: number }), metric: Metric): number {
  return t[metric] ?? 0;
}
