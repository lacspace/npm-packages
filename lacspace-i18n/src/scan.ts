/**
 * Source-code scanner: find translation-key usages in a project so we can flag
 * keys that are defined-but-never-referenced (dead) and referenced-but-missing
 * (undefined).
 *
 * Recognises call forms `t("key")`, `t('key')`, `` t(`key`) `` (and `i18n.t`,
 * `$t`, plus any `--func` names), attribute forms `i18nKey="key"` /
 * `<Trans i18nKey="key">`, and Vue `$t`. A call whose argument is not a plain
 * string literal (`t(variable)`, `t('a' + b)`) is counted as a DYNAMIC usage
 * that cannot be resolved — the caller should treat "dead" results as advisory
 * and use an ignore list for computed key prefixes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Result of scanning a source tree for key usages. */
export interface ScanResult {
  /** Distinct keys referenced by a static string literal. */
  used: Set<string>;
  /** Number of dynamic (unresolvable) usages found, e.g. `t(variable)`. */
  dynamic: number;
  /** Files scanned. */
  files: number;
}

export interface ScanOptions {
  /** Function / attribute names to look for. Default: `t`, `$t`, `i18n.t`, `i18nKey`. */
  funcs?: string[];
  /** File extensions to include (with dot). */
  extensions?: string[];
  /** Directory names to skip. */
  skipDirs?: string[];
}

const DEFAULT_FUNCS = ["t", "$t", "i18n.t", "i18nKey"];
const DEFAULT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"];
const DEFAULT_SKIP = ["node_modules", "dist", "build", ".next", ".git", "coverage", ".svelte-kit", "out"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan a string of source for key usages, mutating `result`. */
export function scanSource(code: string, funcs: string[], result: ScanResult): void {
  const callFuncs = funcs.filter((f) => !/key$/i.test(f));
  const attrFuncs = funcs.filter((f) => /key$/i.test(f));

  // call form: func( <arg> ...
  if (callFuncs.length) {
    const names = callFuncs.map(escapeRe).join("|");
    const callRe = new RegExp(`(?:^|[^\\w$.])(?:${names})\\s*\\(\\s*([^)]*?)(?:[,)])`, "g");
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(code)) !== null) {
      const arg = m[1]!.trim();
      const lit = staticStringLiteral(arg);
      if (lit !== null) result.used.add(lit);
      else if (arg !== "") result.dynamic++;
    }
  }

  // attribute form: i18nKey="key" or i18nKey='key'
  if (attrFuncs.length) {
    const names = attrFuncs.map(escapeRe).join("|");
    const attrRe = new RegExp(`(?:${names})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)\\s*\\})`, "g");
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(code)) !== null) {
      const key = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
      if (key !== undefined && key !== "") result.used.add(key);
    }
  }
}

/** If `arg` is a single quoted/backtick string literal with no interpolation, return its value. */
function staticStringLiteral(arg: string): string | null {
  if ((arg.startsWith('"') && arg.endsWith('"') && arg.length >= 2) ||
      (arg.startsWith("'") && arg.endsWith("'") && arg.length >= 2)) {
    const inner = arg.slice(1, -1);
    if (inner.includes(arg[0]!)) return null; // extra same-quote → not a clean literal
    return inner;
  }
  if (arg.startsWith("`") && arg.endsWith("`") && arg.length >= 2) {
    const inner = arg.slice(1, -1);
    if (inner.includes("${")) return null; // template interpolation → dynamic
    return inner;
  }
  return null;
}

/** Recursively scan a source directory for key usages. */
export function scanDir(dir: string, options: ScanOptions = {}): ScanResult {
  const funcs = options.funcs ?? DEFAULT_FUNCS;
  const exts = options.extensions ?? DEFAULT_EXTENSIONS;
  const skip = new Set(options.skipDirs ?? DEFAULT_SKIP);
  const result: ScanResult = { used: new Set(), dynamic: 0, files: 0 };

  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (skip.has(entry)) continue;
        walk(full);
      } else if (st.isFile() && exts.some((e) => entry.toLowerCase().endsWith(e))) {
        result.files++;
        scanSource(readFileSync(full, "utf8"), funcs, result);
      }
    }
  };
  walk(dir);
  return result;
}

/**
 * Turn ignore patterns into a matcher over dotted keys. A pattern containing
 * `*` is a glob (anchored, `*` = any run of chars). A plain pattern matches a
 * key exactly or as a dotted prefix (`errors` matches `errors.notFound`).
 */
export function makeIgnoreMatcher(patterns: string[]): (key: string) => boolean {
  if (patterns.length === 0) return () => false;
  const globs = patterns
    .filter((p) => p.includes("*"))
    .map((p) => new RegExp("^" + p.split("*").map(escapeRe).join(".*") + "$"));
  const prefixes = patterns.filter((p) => !p.includes("*")).map((p) => (p.endsWith(".") ? p.slice(0, -1) : p));
  return (key: string) =>
    globs.some((r) => r.test(key)) || prefixes.some((p) => key === p || key.startsWith(p + "."));
}

/** Cross-reference defined keys against scanned usages. */
export interface CodeScanResult extends ScanResult {
  /** Keys defined in the base locale but never referenced in code. */
  dead: string[];
  /** Keys referenced in code but missing from the base locale. */
  undefinedKeys: string[];
}

/**
 * Compare the base locale's keys against source usages found by {@link scanDir}.
 * `ignore` prefixes mark keys as "used" (never dead) to absorb dynamic keys.
 */
export function crossReference(
  baseKeys: string[],
  scan: ScanResult,
  ignore: (key: string) => boolean,
): CodeScanResult {
  const baseSet = new Set(baseKeys);
  const dead: string[] = [];
  for (const key of baseKeys) {
    if (!scan.used.has(key) && !ignore(key)) dead.push(key);
  }
  const undefinedKeys: string[] = [];
  for (const key of scan.used) {
    if (!baseSet.has(key) && !ignore(key)) undefinedKeys.push(key);
  }
  return {
    ...scan,
    dead: dead.sort(),
    undefinedKeys: undefinedKeys.sort(),
  };
}
