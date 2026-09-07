/**
 * lacspace-i18n — a keyless, zero-dependency locale-file manager. Find missing
 * and unused translation keys, diff locales against a base, check ICU /
 * interpolation consistency, and sort / normalize locale files. Fully offline;
 * exits non-zero on problems so it drops straight into CI.
 *
 * ```ts
 * import { check, loadLocales, extractPlaceholders } from "lacspace-i18n";
 *
 * // Full report over a locales directory:
 * const report = check("./locales", { base: "en", src: "./src" });
 * console.log(report.problems);            // { missing, extra, empty, icu, … }
 * for (const l of report.locales) console.log(l.locale, l.coverage + "%");
 *
 * // Just the placeholders in one string:
 * extractPlaceholders("You have {count, plural, one {# item} other {# items}}");
 * // → tokens: {"{count,plural}"}, errors: []
 * ```
 *
 * Supports JSON (nested or flat dotted keys), a common subset of YAML, and
 * Java-style `.properties`, in either a `locales/{en,ne}.json` layout or a
 * namespaced `locales/{en,ne}/common.json` layout.
 */

export { flatten, unflatten, sortFlat, compareKeys } from "./flatten.js";
export type { JsonValue, Scalar, FlatMap } from "./flatten.js";

export { formatFromPath, parseByFormat, parseJson, parseYaml, parseProperties, ParseError } from "./readers.js";
export type { FileFormat } from "./readers.js";

export { loadLocales, prefixKey } from "./load.js";
export type { LocaleFile, LoadedLocale, LoadResult } from "./load.js";

export { compareLocale, compareAll } from "./compare.js";
export type { LocaleComparison } from "./compare.js";

export { extractPlaceholders, checkPlaceholders } from "./placeholders.js";
export type { PlaceholderResult, PlaceholderIssue, MalformedIcu, PlaceholderReport } from "./placeholders.js";

export { scanSource, scanDir, crossReference, makeIgnoreMatcher } from "./scan.js";
export type { ScanResult, ScanOptions, CodeScanResult } from "./scan.js";

export { serialize, normalizeFile, sortLocales, baseSubsetFor } from "./sort.js";
export type { SortOptions, FileSortResult } from "./sort.js";

export { check, reportFromLoad, pickBase, failingCategories } from "./check.js";
export type { CheckOptions, I18nReport, FailCategory } from "./check.js";

export { renderHuman, renderMarkdown, toJson } from "./report.js";
export type { Colorize } from "./report.js";

// --- new in 0.2.0 ---

export { parseIcu, isValidIcu, checkIcu } from "./icu.js";
export type { IcuNode, IcuOption, IcuParseResult, IcuCheckResult } from "./icu.js";

export {
  convert, parseToFlat, serializeFlat, parsePo, serializePo, convertFormatFromPath,
} from "./convert.js";
export type { ConvertFormat } from "./convert.js";

export { mergeLocale, syncLocales, isMarker, DEFAULT_MARKER } from "./sync.js";
export type { SyncOptions, MergeResult, SyncFileResult } from "./sync.js";

export { localeCoverage, coverageReport, belowThreshold } from "./coverage.js";
export type { CoverageOptions, LocaleCoverage } from "./coverage.js";

export { findKeyUsage, reconcile } from "./usage.js";
export type { KeyUsage, Reconciliation } from "./usage.js";
