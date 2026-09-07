/**
 * High-level orchestration: load a locale directory and run every check
 * (missing / extra / empty / identical / coverage, placeholder + ICU
 * consistency, and optional dead/undefined code scan) into one report object
 * shared by the CLI and the library.
 */
import { loadLocales } from "./load.js";
import type { LoadResult } from "./load.js";
import { compareAll } from "./compare.js";
import type { LocaleComparison } from "./compare.js";
import { checkPlaceholders } from "./placeholders.js";
import type { PlaceholderIssue, MalformedIcu } from "./placeholders.js";
import { scanDir, crossReference, makeIgnoreMatcher } from "./scan.js";
import type { CodeScanResult } from "./scan.js";

export interface CheckOptions {
  /** Base locale code. Defaults to `en` if present, else the first locale. */
  base?: string;
  /** Project source directory to scan for key usages (enables dead/undefined). */
  src?: string;
  /** Key-usage function/attribute names for the scan. */
  funcs?: string[];
  /** Ignore-prefix / glob patterns treated as "used" and never dead/undefined. */
  ignore?: string[];
}

/** The complete i18n report. */
export interface I18nReport {
  dir: string;
  base: string;
  baseTotal: number;
  layout: LoadResult["layout"];
  locales: LocaleComparison[];
  placeholders: PlaceholderIssue[];
  malformed: MalformedIcu[];
  code: CodeScanResult | null;
  problems: {
    missing: number;
    extra: number;
    empty: number;
    identical: number;
    icu: number;
    undefinedKeys: number;
    dead: number;
  };
}

/** Pick the base locale code: the requested one, else `en`, else the first. */
export function pickBase(codes: string[], requested?: string): string {
  if (requested) {
    if (!codes.includes(requested)) throw new Error(`base locale "${requested}" not found (have: ${codes.join(", ")})`);
    return requested;
  }
  if (codes.includes("en")) return "en";
  return codes[0]!;
}

/** Run all checks over a directory of locale files. */
export function check(dir: string, options: CheckOptions = {}): I18nReport {
  const load = loadLocales(dir);
  return reportFromLoad(load, options);
}

/** Same as {@link check} but from an already-loaded result (used by tests / sort). */
export function reportFromLoad(load: LoadResult, options: CheckOptions = {}): I18nReport {
  const codes = load.locales.map((l) => l.code);
  const base = pickBase(codes, options.base);
  const baseLocale = load.locales.find((l) => l.code === base)!;

  const locales = compareAll(baseLocale.flat, load.locales, base);
  const { issues, malformed } = checkPlaceholders(baseLocale.flat, load.locales, base);

  let code: CodeScanResult | null = null;
  if (options.src) {
    const scan = scanDir(options.src, options.funcs ? { funcs: options.funcs } : {});
    const ignore = makeIgnoreMatcher(options.ignore ?? []);
    code = crossReference(Object.keys(baseLocale.flat), scan, ignore);
  }

  const problems = {
    missing: locales.reduce((n, l) => n + l.missing.length, 0),
    extra: locales.reduce((n, l) => n + l.extra.length, 0),
    empty: locales.reduce((n, l) => n + l.empty.length, 0),
    identical: locales.reduce((n, l) => n + l.identical.length, 0),
    icu: issues.length + malformed.length,
    undefinedKeys: code ? code.undefinedKeys.length : 0,
    dead: code ? code.dead.length : 0,
  };

  return {
    dir: load.dir,
    base,
    baseTotal: Object.keys(baseLocale.flat).length,
    layout: load.layout,
    locales,
    placeholders: issues,
    malformed,
    code,
    problems,
  };
}

/** Categories usable in `--fail-on`. */
export type FailCategory = "missing" | "extra" | "empty" | "identical" | "icu" | "undefined" | "dead";

/** Return the fail categories that are non-zero for the given report. */
export function failingCategories(report: I18nReport, categories: FailCategory[]): FailCategory[] {
  const map: Record<FailCategory, number> = {
    missing: report.problems.missing,
    extra: report.problems.extra,
    empty: report.problems.empty,
    identical: report.problems.identical,
    icu: report.problems.icu,
    undefined: report.problems.undefinedKeys,
    dead: report.problems.dead,
  };
  return categories.filter((c) => (map[c] ?? 0) > 0);
}
