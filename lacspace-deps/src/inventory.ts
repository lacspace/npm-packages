import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** How a direct dependency is declared in package.json. */
export type DepType = "prod" | "dev" | "peer" | "optional";

/** A dependency declared directly in the project's package.json. */
export interface DeclaredDep {
  name: string;
  /** The semver range as written, e.g. "^1.2.0" or "workspace:*". */
  range: string;
  type: DepType;
}

/** A package physically installed under node_modules. */
export interface InstalledPackage {
  name: string;
  version: string;
  /** node_modules-relative path from the project root, e.g. "node_modules/foo". */
  path: string;
  /** Absolute directory on disk. */
  dir: string;
  /** Nesting depth (0 = top-level node_modules). */
  depth: number;
  /** True when the name is a direct dependency of the root package.json. */
  direct: boolean;
  /** True when the direct dependency is declared only in devDependencies. */
  dev: boolean;
  /** Raw `license`/`licenses` field, normalized to an SPDX-ish string or null. */
  license: string | null;
  /** Names this package depends on (from its own package.json). */
  dependencies: string[];
}

export type LockfileType =
  | "npm-v3"
  | "npm-v2"
  | "npm-v1"
  | "pnpm"
  | "yarn"
  | "none";

/** The full parsed picture of a project's dependency state. */
export interface Inventory {
  /** Absolute project directory. */
  root: string;
  projectName: string | null;
  projectVersion: string | null;
  declared: DeclaredDep[];
  lockfileType: LockfileType;
  /** Whether node_modules was present and scanned. */
  hasNodeModules: boolean;
  /** Every installed package (one entry per install location). */
  installed: InstalledPackage[];
}

export interface InventoryOptions {
  /** Skip devDependencies when marking direct deps + in downstream reports. */
  prod?: boolean;
}

interface RawPkgJson {
  name?: string;
  version?: string;
  license?: unknown;
  licenses?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Read + JSON-parse a file, returning null on any error. */
export function readJson<T = unknown>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Normalize a package.json `license` / `licenses` field into a single
 * SPDX-ish string (or null when absent). Handles the string form, the
 * deprecated `{ type }` object form and the legacy `licenses: [...]` array.
 */
export function normalizeLicense(pkg: {
  license?: unknown;
  licenses?: unknown;
}): string | null {
  const { license, licenses } = pkg;
  if (typeof license === "string" && license.trim()) return license.trim();
  if (license && typeof license === "object") {
    const t = (license as { type?: unknown }).type;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  if (Array.isArray(licenses)) {
    const parts = licenses
      .map((l) =>
        typeof l === "string"
          ? l
          : l && typeof l === "object"
            ? (l as { type?: unknown }).type
            : null,
      )
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (parts.length === 1) return parts[0]!.trim();
    if (parts.length > 1) return `(${parts.map((p) => p.trim()).join(" OR ")})`;
  }
  return null;
}

/** Read the declared direct dependencies from a parsed package.json. */
export function collectDeclared(pkg: RawPkgJson): DeclaredDep[] {
  const out: DeclaredDep[] = [];
  const add = (map: Record<string, string> | undefined, type: DepType): void => {
    if (!map) return;
    for (const [name, range] of Object.entries(map)) {
      out.push({ name, range: String(range), type });
    }
  };
  add(pkg.dependencies, "prod");
  add(pkg.devDependencies, "dev");
  add(pkg.peerDependencies, "peer");
  add(pkg.optionalDependencies, "optional");
  return out;
}

/** Detect which lockfile (if any) a project uses. */
export function detectLockfile(root: string): LockfileType {
  if (existsSync(join(root, "package-lock.json"))) {
    const lock = readJson<{ lockfileVersion?: number; packages?: unknown }>(
      join(root, "package-lock.json"),
    );
    if (lock) {
      if (lock.lockfileVersion === 3) return "npm-v3";
      if (lock.lockfileVersion === 2 || lock.packages) return "npm-v2";
      return "npm-v1";
    }
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "none";
}

/**
 * Best-effort parse of the *direct* dependency names + versions a pnpm or yarn
 * lockfile records. Full transitive resolution for these formats is out of
 * scope (documented); we surface enough for licence/size scans to still run off
 * node_modules, and to name the direct set when node_modules is missing.
 */
export function parseYarnLockDirect(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const blocks = text.split(/\n(?=\S)/);
  for (const block of blocks) {
    const header = block.split("\n")[0] ?? "";
    if (!header.includes(":")) continue;
    const verMatch = block.match(/\n\s+version:?\s+"?([^"\n]+)"?/);
    if (!verMatch) continue;
    const version = verMatch[1]!.trim();
    // header is a comma-separated list of "name@range" selectors
    const selectors = header.replace(/:\s*$/, "").split(",");
    for (const sel of selectors) {
      const s = sel.trim().replace(/^"|"$/g, "");
      const at = s.lastIndexOf("@");
      if (at <= 0) continue;
      const name = s.slice(0, at);
      out.set(name, version);
    }
  }
  return out;
}

/** Best-effort direct package versions from a pnpm-lock.yaml. */
export function parsePnpmLockDirect(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.split("\n");
  for (const line of lines) {
    // packages under "  /name@version:" or "  name@version:" keys
    const m = line.match(/^\s{2}\/?((?:@[^/@\s]+\/)?[^@/\s]+)@([0-9][^(:\s]*)/);
    if (m) out.set(m[1]!, m[2]!);
  }
  return out;
}

const SKIP_ENTRIES = new Set([".bin", ".cache", ".package-lock.json", ".pnpm", ".store"]);

/**
 * Walk a node_modules tree, yielding one InstalledPackage per install location
 * (top-level and nested/deduped copies). Handles scoped packages and nested
 * `node_modules` (npm's dedupe leaves multiple versions on disk).
 */
export function scanNodeModules(
  root: string,
  directNames: Set<string>,
  devNames: Set<string>,
): InstalledPackage[] {
  const out: InstalledPackage[] = [];

  const walk = (nmDir: string, depth: number): void => {
    let entries: string[];
    try {
      entries = readdirSync(nmDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_ENTRIES.has(entry)) continue;
      const full = join(nmDir, entry);
      if (entry.startsWith("@")) {
        // scope directory — each child is a package
        let scoped: string[];
        try {
          scoped = readdirSync(full);
        } catch {
          continue;
        }
        for (const child of scoped) {
          readPackage(join(full, child), depth);
        }
      } else {
        readPackage(full, depth);
      }
    }
  };

  const readPackage = (pkgDir: string, depth: number): void => {
    let st;
    try {
      st = statSync(pkgDir);
    } catch {
      return;
    }
    if (!st.isDirectory()) return;
    const pj = join(pkgDir, "package.json");
    const meta = readJson<RawPkgJson>(pj);
    const path = relative(root, pkgDir).split(sep).join("/");
    if (meta && typeof meta.name === "string") {
      const name = meta.name;
      out.push({
        name,
        version: typeof meta.version === "string" ? meta.version : "0.0.0",
        path,
        dir: pkgDir,
        depth,
        direct: depth === 0 && directNames.has(name),
        dev: depth === 0 && devNames.has(name),
        license: normalizeLicense(meta),
        dependencies: meta.dependencies ? Object.keys(meta.dependencies) : [],
      });
    }
    // recurse into a nested node_modules if present
    const nested = join(pkgDir, "node_modules");
    if (existsSync(nested)) walk(nested, depth + 1);
  };

  walk(join(root, "node_modules"), 0);
  return out;
}

/**
 * Build a full Inventory for a project directory: declared deps from
 * package.json, the lockfile flavour, and every installed package discovered by
 * scanning node_modules (the ground truth for licences, size and duplicates).
 */
export function buildInventory(root: string, opts: InventoryOptions = {}): Inventory {
  const pkg = readJson<RawPkgJson>(join(root, "package.json"));
  if (!pkg) {
    throw new Error(`No readable package.json found in ${root}`);
  }
  let declared = collectDeclared(pkg);
  if (opts.prod) declared = declared.filter((d) => d.type !== "dev");

  const directNames = new Set(declared.map((d) => d.name));
  const devNames = new Set(
    declared.filter((d) => d.type === "dev").map((d) => d.name),
  );
  // Names that are direct in a non-dev role take precedence over dev.
  const prodNames = new Set(
    declared.filter((d) => d.type !== "dev").map((d) => d.name),
  );
  for (const n of prodNames) devNames.delete(n);

  const hasNodeModules = existsSync(join(root, "node_modules"));
  const installed = hasNodeModules
    ? scanNodeModules(root, directNames, devNames)
    : [];

  return {
    root,
    projectName: typeof pkg.name === "string" ? pkg.name : null,
    projectVersion: typeof pkg.version === "string" ? pkg.version : null,
    declared,
    lockfileType: detectLockfile(root),
    hasNodeModules,
    installed,
  };
}
