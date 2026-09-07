import type { InstalledPackage } from "./inventory.js";

/** Coarse licence category for policy + reporting. */
export type LicenseCategory =
  | "permissive"
  | "weak-copyleft"
  | "strong-copyleft"
  | "unknown";

/** Per-package licence record. */
export interface LicenseEntry {
  name: string;
  version: string;
  license: string | null;
  category: LicenseCategory;
}

/** A licence-policy violation (a package that hit --deny or missed --allow). */
export interface LicenseViolation {
  name: string;
  version: string;
  license: string | null;
  /** "deny" = matched a denied pattern; "not-allowed" = outside the allowlist. */
  reason: "deny" | "not-allowed";
}

export interface LicenseSummary {
  /** One entry per distinct installed name@version. */
  entries: LicenseEntry[];
  /** Count of packages per category. */
  totals: Record<LicenseCategory, number>;
  /** Distinct licence id → number of packages. */
  byLicense: Record<string, number>;
  violations: LicenseViolation[];
}

export interface LicensePolicy {
  /** Allowlist patterns; if set, anything not matching is a violation. */
  allow?: string[];
  /** Denylist patterns; any match is a violation. */
  deny?: string[];
}

// Prefix/exact matchers per category. Checked in order: strong, weak, permissive.
const STRONG = [/^AGPL/i, /^GPL/i, /^OSL/i, /^EUPL/i, /^SSPL/i, /^CPAL/i];
const WEAK = [/^LGPL/i, /^MPL/i, /^EPL/i, /^CDDL/i, /^Artistic/i, /^CECILL/i];
const PERMISSIVE = [
  /^MIT/i, /^ISC$/i, /^Apache/i, /^BSD/i, /^0BSD$/i, /^Unlicense$/i,
  /^CC0/i, /^WTFPL$/i, /^Zlib$/i, /^BlueOak/i, /^Python-2\.0$/i,
  /^PostgreSQL$/i, /^Beerware$/i, /^Apache License/i,
];

/** Split an SPDX expression into its component licence ids. */
export function splitExpression(expr: string): string[] {
  return expr
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND|WITH)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Classify a single (possibly compound) licence string into a category. */
export function classifyLicense(license: string | null): LicenseCategory {
  if (!license) return "unknown";
  const trimmed = license.trim();
  if (!trimmed) return "unknown";
  if (/^(UNLICENSED|SEE LICENSE|CUSTOM|PROPRIETARY)/i.test(trimmed)) return "unknown";
  const parts = splitExpression(trimmed);
  // For an "A OR B" choice, the most permissive interpretation wins (the user
  // may pick the friendliest term). We take the least-restrictive category.
  const rank: LicenseCategory[] = ["permissive", "weak-copyleft", "strong-copyleft", "unknown"];
  let best = 3;
  for (const p of parts) {
    let cat: LicenseCategory = "unknown";
    if (STRONG.some((re) => re.test(p))) cat = "strong-copyleft";
    else if (WEAK.some((re) => re.test(p))) cat = "weak-copyleft";
    else if (PERMISSIVE.some((re) => re.test(p))) cat = "permissive";
    else cat = "unknown";
    const idx = rank.indexOf(cat);
    if (idx < best) best = idx;
  }
  return rank[best]!;
}

/** Turn a glob-ish pattern ("BSD-*", "GPL-*") into a case-insensitive RegExp. */
export function patternToRegExp(pattern: string): RegExp {
  const esc = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${esc}$`, "i");
}

/** Does an SPDX licence string match any of the given glob patterns? */
export function licenseMatches(license: string | null, patterns: string[]): boolean {
  if (!patterns.length) return false;
  const res = patterns.map(patternToRegExp);
  const ids = license ? splitExpression(license) : [""];
  const candidates = license ? [license.trim(), ...ids] : [""];
  return candidates.some((c) => res.some((re) => re.test(c)));
}

/**
 * Evaluate an allow/deny policy against a licence.
 *  - A match against any `deny` pattern is a "deny" violation.
 *  - If `allow` is non-empty, a licence matching none of the allow patterns is
 *    a "not-allowed" violation. For "A OR B" the package passes if *any*
 *    component is allowed.
 */
export function evaluatePolicy(
  license: string | null,
  policy: LicensePolicy,
): LicenseViolation["reason"] | null {
  const deny = policy.deny ?? [];
  const allow = policy.allow ?? [];
  if (deny.length && licenseMatches(license, deny)) return "deny";
  if (allow.length) {
    const ids = license ? splitExpression(license) : [];
    const anyAllowed =
      ids.length > 0 &&
      ids.some((id) => allow.some((p) => patternToRegExp(p).test(id)));
    if (!anyAllowed) return "not-allowed";
  }
  return null;
}

/**
 * Build a licence summary across installed packages, deduped by name@version,
 * applying an optional allow/deny policy to collect violations.
 */
export function summarizeLicenses(
  installed: InstalledPackage[],
  policy: LicensePolicy = {},
): LicenseSummary {
  const seen = new Set<string>();
  const entries: LicenseEntry[] = [];
  const totals: Record<LicenseCategory, number> = {
    permissive: 0,
    "weak-copyleft": 0,
    "strong-copyleft": 0,
    unknown: 0,
  };
  const byLicense: Record<string, number> = {};
  const violations: LicenseViolation[] = [];

  for (const p of installed) {
    const key = `${p.name}@${p.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const category = classifyLicense(p.license);
    entries.push({ name: p.name, version: p.version, license: p.license, category });
    totals[category]++;
    const label = p.license ?? "UNKNOWN";
    byLicense[label] = (byLicense[label] ?? 0) + 1;

    const reason = evaluatePolicy(p.license, policy);
    if (reason) {
      violations.push({ name: p.name, version: p.version, license: p.license, reason });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return { entries, totals, byLicense, violations };
}
