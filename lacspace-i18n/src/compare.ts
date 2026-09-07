/**
 * Compare target locales against a base locale: missing / extra / empty /
 * identical keys and a translated-coverage percentage.
 */
import type { FlatMap } from "./flatten.js";
import { compareKeys } from "./flatten.js";

/** Per-locale comparison against the base. */
export interface LocaleComparison {
  locale: string;
  /** Number of keys in the base locale. */
  total: number;
  /** Base keys present in this locale with a non-empty value. */
  translated: number;
  /** Base keys absent from this locale. */
  missing: string[];
  /** Keys in this locale that are not in the base (usually stale). */
  extra: string[];
  /** Keys whose value is an empty string. */
  empty: string[];
  /** Keys whose value is byte-identical to the base (often untranslated). */
  identical: string[];
  /** translated / total, as a 0–100 percentage rounded to 1 decimal. */
  coverage: number;
}

function isEmpty(v: unknown): boolean {
  return v === "" || v === null || v === undefined;
}

function asText(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Compare one target locale's flat map against the base flat map. */
export function compareLocale(locale: string, base: FlatMap, target: FlatMap): LocaleComparison {
  const baseKeys = Object.keys(base);
  const missing: string[] = [];
  const empty: string[] = [];
  const identical: string[] = [];
  let translated = 0;

  for (const key of baseKeys) {
    if (!(key in target)) {
      missing.push(key);
      continue;
    }
    const val = target[key];
    if (isEmpty(val)) {
      empty.push(key);
      continue;
    }
    translated++;
    if (asText(val) === asText(base[key])) identical.push(key);
  }

  const extra: string[] = [];
  for (const key of Object.keys(target)) {
    if (!(key in base)) extra.push(key);
  }

  const total = baseKeys.length;
  const coverage = total === 0 ? 100 : Math.round((translated / total) * 1000) / 10;

  return {
    locale,
    total,
    translated,
    missing: missing.sort(compareKeys),
    extra: extra.sort(compareKeys),
    empty: empty.sort(compareKeys),
    identical: identical.sort(compareKeys),
    coverage,
  };
}

/** Compare every non-base locale in `locales` against `base`. */
export function compareAll(base: FlatMap, locales: Array<{ code: string; flat: FlatMap }>, baseCode: string): LocaleComparison[] {
  return locales
    .filter((l) => l.code !== baseCode)
    .map((l) => compareLocale(l.code, base, l.flat));
}
