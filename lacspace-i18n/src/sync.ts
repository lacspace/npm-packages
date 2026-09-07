/**
 * Auto-sync / fix. Produce a target locale that has every key the base has:
 * existing translations are kept verbatim (never lost), missing keys are filled
 * with either the base value (`--from-base`) or a marker (`__MISSING__` by
 * default), and — with `prune` — keys not in the base are dropped. The merged
 * map preserves the base's key order, with any surviving extra keys appended.
 *
 * This differs from `sort` (which normalizes every file, including the base, and
 * fills with a blank marker): `sync` is target-only, copies base *values* when
 * asked, and orders output by the base so a target reads as a mirror of it.
 */
import type { FlatMap } from "./flatten.js";
import type { LoadResult, LocaleFile } from "./load.js";
import { baseSubsetFor, serialize } from "./sort.js";
import { readFileSync } from "node:fs";

/** The default placeholder written for a missing translation. */
export const DEFAULT_MARKER = "__MISSING__";

export interface SyncOptions {
  /** Value for a filled-in missing key. Default {@link DEFAULT_MARKER}. */
  marker?: string;
  /** Fill missing keys with the base value instead of the marker. */
  fromBase?: boolean;
  /** Drop keys not present in the base. */
  prune?: boolean;
  /** Indent for JSON/YAML output. Default `2`. */
  indent?: number;
}

/** Outcome of merging one target flat map against the base. */
export interface MergeResult {
  merged: FlatMap;
  /** Keys added (were missing from the target). */
  added: string[];
  /** Keys removed by `prune`. */
  removed: string[];
  /** Existing translations carried over unchanged. */
  kept: number;
}

/**
 * Merge one target flat map against the base. Pure — existing target values are
 * never overwritten or lost. Output preserves base key order; surviving extra
 * keys are appended in their original order.
 */
export function mergeLocale(base: FlatMap, target: FlatMap, opts: SyncOptions = {}): MergeResult {
  const marker = opts.marker ?? DEFAULT_MARKER;
  const merged: FlatMap = {};
  const added: string[] = [];
  const removed: string[] = [];
  let kept = 0;

  for (const key of Object.keys(base)) {
    if (key in target) {
      merged[key] = target[key]!;
      kept++;
    } else {
      merged[key] = opts.fromBase ? base[key]! : marker;
      added.push(key);
    }
  }
  for (const key of Object.keys(target)) {
    if (key in base) continue;
    if (opts.prune) removed.push(key);
    else merged[key] = target[key]!;
  }

  return { merged, added, removed, kept };
}

/** Per-file sync outcome (dry-run — caller decides whether to write `after`). */
export interface SyncFileResult {
  path: string;
  locale: string;
  namespace: string | null;
  before: string;
  after: string;
  changed: boolean;
  added: string[];
  removed: string[];
}

function readOr(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Sync every non-base file in a loaded directory against the base locale. */
export function syncLocales(load: LoadResult, baseCode: string, opts: SyncOptions = {}): SyncFileResult[] {
  const base = load.locales.find((l) => l.code === baseCode);
  const indent = opts.indent ?? 2;
  const results: SyncFileResult[] = [];
  if (!base) return results;

  for (const loc of load.locales) {
    if (loc.code === baseCode) continue;
    for (const file of loc.files) {
      const subset = baseSubsetFor(base.flat, file.namespace);
      const { merged, added, removed } = mergeLocale(subset, file.data, opts);
      const before = readOr(file.path);
      const after = serialize(merged, file.format, indent);
      results.push({
        path: file.path,
        locale: file.locale,
        namespace: file.namespace,
        before,
        after,
        changed: before !== after,
        added,
        removed,
      });
    }
  }
  return results;
}

/** True when a value is a fill marker (missing translation), not real content. */
export function isMarker(value: unknown, marker: string = DEFAULT_MARKER): boolean {
  return value === marker;
}
