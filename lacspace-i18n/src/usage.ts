/**
 * Pure translation-key usage helpers, layered on the `scan.ts` engine.
 *
 * {@link findKeyUsage} runs the source scanner over a string of code and returns
 * the distinct static keys plus a dynamic-usage count. {@link reconcile} takes a
 * set of used keys and the base locale's keys and reports `dead` (defined but
 * never used) and `undefined` (used but not defined) keys — the same core the
 * `unused` command uses, exposed as a small, testable, fs-free function.
 */
import { scanSource } from "./scan.js";
import type { ScanResult } from "./scan.js";
import { makeIgnoreMatcher } from "./scan.js";

const DEFAULT_FUNCS = ["t", "$t", "i18n.t", "i18nKey"];

/** Static key usages found in a chunk of source. */
export interface KeyUsage {
  /** Distinct keys referenced by a plain string literal, sorted. */
  used: string[];
  /** Count of unresolvable dynamic usages (e.g. `t(variable)`). */
  dynamic: number;
}

/** Scan a string of source code for translation-key usages (pure). */
export function findKeyUsage(code: string, funcs: string[] = DEFAULT_FUNCS): KeyUsage {
  const result: ScanResult = { used: new Set(), dynamic: 0, files: 0 };
  scanSource(code, funcs, result);
  return { used: [...result.used].sort(), dynamic: result.dynamic };
}

/** Result of {@link reconcile}. */
export interface Reconciliation {
  /** Base keys never referenced in code. */
  dead: string[];
  /** Keys referenced in code but absent from the base. */
  undefinedKeys: string[];
}

/**
 * Reconcile the base locale's keys against a set of used keys. `ignore` (a
 * matcher or a list of prefix/glob patterns) marks keys as "used" so dynamic
 * prefixes aren't reported dead/undefined.
 */
export function reconcile(
  baseKeys: Iterable<string>,
  usedKeys: Iterable<string>,
  ignore: ((key: string) => boolean) | string[] = [],
): Reconciliation {
  const isIgnored = Array.isArray(ignore) ? makeIgnoreMatcher(ignore) : ignore;
  const base = [...baseKeys];
  const baseSet = new Set(base);
  const used = new Set(usedKeys);

  const dead: string[] = [];
  for (const key of base) {
    if (!used.has(key) && !isIgnored(key)) dead.push(key);
  }
  const undefinedKeys: string[] = [];
  for (const key of used) {
    if (!baseSet.has(key) && !isIgnored(key)) undefinedKeys.push(key);
  }
  return { dead: dead.sort(), undefinedKeys: undefinedKeys.sort() };
}
