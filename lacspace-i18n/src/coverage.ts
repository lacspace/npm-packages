/**
 * Translation-coverage math with marker awareness and a CI threshold.
 *
 * The existing `compareLocale` counts any non-empty value as translated; this
 * module additionally treats fill markers (e.g. `__MISSING__`, or `[TODO]`) as
 * NOT translated, so `sync`-filled placeholders don't inflate coverage. It also
 * provides {@link belowThreshold} for a `--min` CI gate.
 */
import type { FlatMap } from "./flatten.js";
import { DEFAULT_MARKER } from "./sync.js";

export interface CoverageOptions {
  /** Values to treat as untranslated placeholders. Default `["__MISSING__"]`. */
  markers?: string[];
}

/** Coverage of a single locale against the base. */
export interface LocaleCoverage {
  locale: string;
  total: number;
  translated: number;
  /** Keys present but holding a marker value. */
  markers: number;
  /** translated / total × 100, rounded to 1 decimal. */
  coverage: number;
}

function isEmpty(v: unknown): boolean {
  return v === "" || v === null || v === undefined;
}

/** Compute marker-aware coverage of `target` against `base`. */
export function localeCoverage(
  locale: string,
  base: FlatMap,
  target: FlatMap,
  opts: CoverageOptions = {},
): LocaleCoverage {
  const markerSet = new Set(opts.markers ?? [DEFAULT_MARKER]);
  const keys = Object.keys(base);
  let translated = 0;
  let markers = 0;
  for (const key of keys) {
    if (!(key in target)) continue;
    const v = target[key];
    if (isEmpty(v)) continue;
    if (markerSet.has(String(v))) {
      markers++;
      continue;
    }
    translated++;
  }
  const total = keys.length;
  const coverage = total === 0 ? 100 : Math.round((translated / total) * 1000) / 10;
  return { locale, total, translated, markers, coverage };
}

/** Coverage for every non-base locale. */
export function coverageReport(
  base: FlatMap,
  locales: Array<{ code: string; flat: FlatMap }>,
  baseCode: string,
  opts: CoverageOptions = {},
): LocaleCoverage[] {
  return locales
    .filter((l) => l.code !== baseCode)
    .map((l) => localeCoverage(l.code, base, l.flat, opts));
}

/** Locales whose coverage is strictly below `min` (a 0–100 percentage). */
export function belowThreshold(reports: LocaleCoverage[], min: number): LocaleCoverage[] {
  return reports.filter((r) => r.coverage < min);
}
