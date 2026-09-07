import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { LicenseCategory, LicensePolicy } from "./licenses.js";
import type { AuditOptions, FailOn } from "./audit.js";

/**
 * A `.depsrc.json` project policy file. Every field is optional. Fields may be
 * given flat at the top level, or nested under a `policy` object for the licence
 * bits — both shapes are accepted:
 *
 * ```json
 * { "allow": ["MIT", "ISC", "BSD-*"], "deny": ["GPL-*"], "maxSeverity": "weak-copyleft",
 *   "failOn": ["missing", "duplicates"], "ignoreUnused": ["some-tool"], "prod": true }
 * ```
 * ```json
 * { "policy": { "allow": ["MIT"], "maxSeverity": "permissive" }, "failOn": ["missing"] }
 * ```
 */
export interface DepsConfig {
  /** Allowed licence globs (e.g. "MIT", "BSD-*"). */
  allow?: string[];
  /** Denied licence globs (e.g. "GPL-*", "AGPL-*"). */
  deny?: string[];
  /** Most restrictive licence category tolerated. */
  maxSeverity?: LicenseCategory;
  /** Extra `--fail-on` gates to apply. */
  failOn?: FailOn[];
  /** Dependency names to never report as unused. */
  ignoreUnused?: string[];
  /** Ignore devDependencies. */
  prod?: boolean;
  /** Add a rough gzip estimate to the size report. */
  gzip?: boolean;
}

/** Filenames searched (in order) when no explicit `--policy` path is given. */
export const CONFIG_FILENAMES = [".depsrc.json", ".depsrc"] as const;

const CATEGORIES = new Set<LicenseCategory>([
  "permissive",
  "weak-copyleft",
  "strong-copyleft",
  "unknown",
]);
const FAIL_ON = new Set<FailOn>(["unused", "missing", "license", "outdated", "duplicates"]);

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
  return out.length ? out : undefined;
}

function asCategory(v: unknown): LicenseCategory | undefined {
  return typeof v === "string" && CATEGORIES.has(v as LicenseCategory) ? (v as LicenseCategory) : undefined;
}

function asFailOn(v: unknown): FailOn[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is FailOn => typeof x === "string" && FAIL_ON.has(x as FailOn));
  return out.length ? [...new Set(out)] : undefined;
}

/**
 * Pure: validate + normalize an arbitrary parsed value into a {@link DepsConfig},
 * silently dropping anything of the wrong shape. Accepts both the flat form and a
 * nested `policy: { allow, deny, maxSeverity }` object.
 */
export function normalizeConfig(raw: unknown): DepsConfig {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const nested = r.policy && typeof r.policy === "object" ? (r.policy as Record<string, unknown>) : {};
  const out: DepsConfig = {};

  const allow = asStringArray(nested.allow) ?? asStringArray(r.allow);
  const deny = asStringArray(nested.deny) ?? asStringArray(r.deny);
  const maxSeverity = asCategory(nested.maxSeverity) ?? asCategory(r.maxSeverity);
  const failOn = asFailOn(r.failOn);
  const ignoreUnused = asStringArray(r.ignoreUnused);

  if (allow) out.allow = allow;
  if (deny) out.deny = deny;
  if (maxSeverity) out.maxSeverity = maxSeverity;
  if (failOn) out.failOn = failOn;
  if (ignoreUnused) out.ignoreUnused = ignoreUnused;
  if (typeof r.prod === "boolean") out.prod = r.prod;
  if (typeof r.gzip === "boolean") out.gzip = r.gzip;
  return out;
}

/**
 * Pure: merge a base config with an override. Scalars and arrays present on the
 * override win outright; missing override fields fall back to the base. Use it to
 * layer CLI flags (override) on top of a loaded `.depsrc.json` (base).
 */
export function mergeConfig(base: DepsConfig, override: DepsConfig): DepsConfig {
  return {
    ...base,
    ...override,
    ...(override.allow ?? base.allow ? { allow: override.allow ?? base.allow } : {}),
    ...(override.deny ?? base.deny ? { deny: override.deny ?? base.deny } : {}),
  };
}

/** Pure: derive the licence {@link LicensePolicy} carried by a config. */
export function configToPolicy(config: DepsConfig): LicensePolicy {
  const policy: LicensePolicy = {};
  if (config.allow) policy.allow = config.allow;
  if (config.deny) policy.deny = config.deny;
  if (config.maxSeverity) policy.maxSeverity = config.maxSeverity;
  return policy;
}

/**
 * Pure: turn a resolved {@link DepsConfig} into {@link AuditOptions} for `audit()`
 * — the library-side equivalent of what the CLI does with a `.depsrc.json`.
 */
export function configToAuditOptions(config: DepsConfig): AuditOptions {
  const opts: AuditOptions = { policy: configToPolicy(config) };
  if (config.prod) opts.prod = true;
  if (config.gzip) opts.gzip = true;
  if (config.ignoreUnused) opts.usage = { ignoreUnused: config.ignoreUnused };
  return opts;
}

/**
 * Locate a config file. An explicit path is resolved against `dir` (or used as-is
 * when absolute); otherwise {@link CONFIG_FILENAMES} are searched in `dir`.
 * Returns the absolute path, or null when nothing was found.
 */
export function findConfigPath(dir: string, explicit?: string): string | null {
  if (explicit) {
    const p = isAbsolute(explicit) ? explicit : resolve(dir, explicit);
    return existsSync(p) ? p : null;
  }
  for (const name of CONFIG_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Load + normalize a `.depsrc.json` for a project directory. When `explicit` is
 * given but missing or unparseable, this throws (an explicit request must be
 * honoured); auto-discovery failures are silent (returns an empty config).
 */
export function loadConfig(
  dir: string,
  explicit?: string,
): { config: DepsConfig; path: string | null } {
  const path = findConfigPath(dir, explicit);
  if (!path) {
    if (explicit) throw new Error(`Policy file not found: ${explicit}`);
    return { config: {}, path: null };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`Cannot read policy file ${path}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in policy file ${path}: ${(err as Error).message}`);
  }
  return { config: normalizeConfig(parsed), path };
}
