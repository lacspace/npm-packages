import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { builtinModules } from "node:module";
import type { DeclaredDep } from "./inventory.js";

const SOURCE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".next", ".nuxt", "out", "coverage",
  ".git", ".cache", ".turbo", ".svelte-kit", "vendor",
]);

const BUILTINS = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

/**
 * Build-time / config tooling that is commonly used WITHOUT ever being
 * `import`ed from source (it runs as a binary or is referenced by config), so
 * flagging it as "unused" is almost always a false positive. Kept conservative.
 */
export const IMPLICIT_TOOLING = new Set<string>([
  "typescript", "tsup", "vitest", "jest", "mocha", "ava", "tap",
  "eslint", "prettier", "rollup", "webpack", "vite", "esbuild", "babel",
  "@babel/core", "ts-node", "tsx", "nodemon", "concurrently", "rimraf",
  "npm-run-all", "husky", "lint-staged", "postcss", "tailwindcss",
  "autoprefixer", "sass", "less", "cross-env", "dotenv-cli", "turbo",
]);

/** The result of scanning a project's own source for import specifiers. */
export interface UsageScan {
  /** Distinct top-level package names imported from source. */
  imported: string[];
  /** Number of source files scanned. */
  files: number;
}

/** Unused / missing analysis result. */
export interface UsageReport extends UsageScan {
  /** Declared deps never imported from source (best-effort — see caveats). */
  unused: string[];
  /** Imported packages not declared in any dependency field. */
  missing: string[];
  /** Names skipped from `unused` because they look like implicit tooling. */
  ignoredTooling: string[];
}

// import ... from "x" | export ... from "x" | import "x"
const STATIC_RE = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g;
// require("x") | require(`x`)
const REQUIRE_RE = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
// import("x") dynamic
const DYNAMIC_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/**
 * Normalize an import specifier to its package name, or null when it is not an
 * external package (relative path, absolute path, bare builtin, data:/node:
 * protocol other than a builtin, template with an expression, etc.).
 *
 *  - `@scope/pkg/sub` → `@scope/pkg`
 *  - `pkg/sub/path`   → `pkg`
 *  - `./x`, `../x`, `/x`, `#alias` → null
 *  - node builtins (`fs`, `node:path`) → null
 */
export function specifierToPackage(spec: string): string | null {
  if (!spec) return null;
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#")) return null;
  if (/^[a-z]+:/i.test(spec) && !spec.startsWith("node:")) return null; // http:, data:, etc.
  if (BUILTINS.has(spec)) return null;
  const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
  const parts = bare.split("/");
  let name: string;
  if (bare.startsWith("@")) {
    if (parts.length < 2) return null;
    name = `${parts[0]}/${parts[1]}`;
  } else {
    name = parts[0]!;
  }
  if (BUILTINS.has(name)) return null;
  if (!name) return null;
  return name;
}

/** Extract all import/require/dynamic-import specifiers from source text. */
export function extractSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const re of [STATIC_RE, REQUIRE_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[1]!);
  }
  return out;
}

/** Recursively list source files under a directory, skipping build/vendor dirs. */
export function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".") {
        if (SKIP_DIRS.has(entry)) continue;
      }
      const full = join(cur, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        stack.push(full);
      } else if (st.isFile() && SOURCE_EXT.has(extname(entry))) {
        out.push(full);
      }
    }
  }
  return out;
}

/** Scan a project's own source tree for imported package names. */
export function scanImports(root: string): UsageScan {
  const files = listSourceFiles(root);
  const imported = new Set<string>();
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const spec of extractSpecifiers(src)) {
      const name = specifierToPackage(spec);
      if (name) imported.add(name);
    }
  }
  return { imported: [...imported].sort(), files: files.length };
}

export interface UsageOptions {
  /** Treat these declared names as always-used (never "unused"). */
  ignoreUnused?: string[];
  /** Disable the built-in implicit-tooling ignore list. */
  noToolingIgnore?: boolean;
  /** The project's own package name — never reported as missing (self-import). */
  selfName?: string | null;
}

/**
 * Cross-reference declared deps against imported packages to find unused
 * (declared, never imported) and missing (imported, never declared) deps.
 *
 * Heuristics that reduce false positives:
 *  - `@types/x` is considered used when `x` is imported or declared.
 *  - Common build tooling (see IMPLICIT_TOOLING) is not reported as unused.
 */
export function analyzeUsage(
  root: string,
  declared: DeclaredDep[],
  opts: UsageOptions = {},
): UsageReport {
  const scan = scanImports(root);
  const importedSet = new Set(scan.imported);
  const declaredSet = new Set(declared.map((d) => d.name));
  const ignore = new Set(opts.ignoreUnused ?? []);
  const tooling = opts.noToolingIgnore ? new Set<string>() : IMPLICIT_TOOLING;

  const unused: string[] = [];
  const ignoredTooling: string[] = [];
  for (const d of declared) {
    const name = d.name;
    if (importedSet.has(name)) continue;
    if (ignore.has(name)) continue;
    // @types/x used if x is imported/declared, or x is a node builtin
    // (@types/node provides the types for `node:*` builtins).
    if (name.startsWith("@types/")) {
      const target = name.slice("@types/".length).replace(/^([^/]+)__/, "@$1/");
      if (importedSet.has(target) || declaredSet.has(target)) continue;
      if (target === "node" || BUILTINS.has(target)) continue;
    }
    if (tooling.has(name)) {
      ignoredTooling.push(name);
      continue;
    }
    unused.push(name);
  }

  const missing: string[] = [];
  for (const name of scan.imported) {
    if (declaredSet.has(name)) continue;
    if (opts.selfName && name === opts.selfName) continue; // self-import
    missing.push(name);
  }

  return {
    ...scan,
    unused: unused.sort(),
    missing: missing.sort(),
    ignoredTooling: ignoredTooling.sort(),
  };
}
