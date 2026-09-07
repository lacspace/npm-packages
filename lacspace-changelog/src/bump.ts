/**
 * Decide the next semantic version from a set of parsed commits. Pure: no git,
 * no fs. Given the current version and the commits since it, returns the
 * recommended bump and the resulting version string.
 */
import type { ParsedCommit } from "./commit.js";
import {
  inc,
  incStr,
  mustParseSemver,
  formatSemver,
  isValidSemver,
} from "./semver.js";
import type { ReleaseType } from "./semver.js";

export interface BumpOptions {
  /**
   * Types that force a MAJOR bump even without a breaking-change marker (from a
   * custom config). Default: `[]`. Honoured like a breaking change.
   */
  majorTypes?: string[];
  /** Types that count as a `feat` (minor). Default: `["feat"]`. */
  minorTypes?: string[];
  /** Types that count as a `fix` (patch). Default: `["fix", "perf"]`. */
  patchTypes?: string[];
  /**
   * While the version is `0.x`, treat a breaking change as a MINOR bump rather
   * than a major (semver's pre-1.0 convention). Default: true.
   */
  pre1BreakingIsMinor?: boolean;
  /**
   * Force a specific release. Either a level (`major`/`minor`/`patch`) or an
   * explicit version string (e.g. `2.0.0`). Overrides commit analysis.
   */
  releaseAs?: string;
  /** Prerelease identifier, e.g. `beta` → `1.2.0-beta.0`. */
  preid?: string;
  /** When no commit warrants a bump, still bump the patch. Default: false. */
  always?: boolean;
}

/** What the analysis recommended. */
export type BumpLevel = "major" | "minor" | "patch" | "none";

export interface BumpResult {
  /** The version before the bump. */
  current: string;
  /** The computed next version (equals `current` when level is "none"). */
  next: string;
  /** The recommended level. */
  level: BumpLevel;
  /** Why this level was chosen (human-readable). */
  reason: string;
  /** Count of commits by contribution. */
  stats: { breaking: number; features: number; fixes: number; other: number };
  /** True when an explicit `--release-as` overrode commit analysis. */
  overridden: boolean;
}

function classify(
  commits: ParsedCommit[],
  minorTypes: string[],
  patchTypes: string[],
  majorTypes: string[],
): BumpResult["stats"] {
  const stats = { breaking: 0, features: 0, fixes: 0, other: 0 };
  for (const c of commits) {
    const isMajorType = majorTypes.includes(c.type);
    if (c.breaking || isMajorType) stats.breaking++;
    if (minorTypes.includes(c.type)) stats.features++;
    else if (patchTypes.includes(c.type)) stats.fixes++;
    else if (!c.breaking && !isMajorType) stats.other++;
  }
  return stats;
}

/**
 * Recommend the next version.
 */
export function recommendBump(
  commits: ParsedCommit[],
  currentVersion: string,
  opts: BumpOptions = {},
): BumpResult {
  const minorTypes = opts.minorTypes ?? ["feat"];
  const patchTypes = opts.patchTypes ?? ["fix", "perf"];
  const majorTypes = opts.majorTypes ?? [];
  const pre1BreakingIsMinor = opts.pre1BreakingIsMinor ?? true;
  const current = mustParseSemver(currentVersion);
  const currentStr = formatSemver(current);
  const stats = classify(commits, minorTypes, patchTypes, majorTypes);
  const isZeroMajor = current.major === 0;

  // --- explicit override -------------------------------------------------
  if (opts.releaseAs) {
    const ra = opts.releaseAs.toLowerCase();
    if (ra === "major" || ra === "minor" || ra === "patch") {
      const level = ra as ReleaseType;
      const next = opts.preid
        ? incStr(current, `pre${level}` as const, opts.preid)
        : incStr(current, level);
      return {
        current: currentStr,
        next,
        level,
        reason: `--release-as ${level}`,
        stats,
        overridden: true,
      };
    }
    // explicit version string
    if (!isValidSemver(opts.releaseAs)) {
      throw new Error(
        `--release-as must be major|minor|patch or a valid semver version, got "${opts.releaseAs}"`,
      );
    }
    const explicit = formatSemver(mustParseSemver(opts.releaseAs));
    return {
      current: currentStr,
      next: explicit,
      level: "patch",
      reason: `--release-as ${explicit} (explicit version)`,
      stats,
      overridden: true,
    };
  }

  // --- prerelease continuation ------------------------------------------
  // If we're already on a prerelease and a preid is requested, bump it.
  if (opts.preid && current.prerelease.length > 0) {
    const next = incStr(current, "prerelease", opts.preid);
    return {
      current: currentStr,
      next,
      level: "patch",
      reason: `continue prerelease (${opts.preid})`,
      stats,
      overridden: false,
    };
  }

  // --- analyse commits ---------------------------------------------------
  let level: BumpLevel;
  let reason: string;
  if (stats.breaking > 0) {
    if (isZeroMajor && pre1BreakingIsMinor) {
      level = "minor";
      reason = `${stats.breaking} breaking change${stats.breaking === 1 ? "" : "s"} (0.x → minor)`;
    } else {
      level = "major";
      reason = `${stats.breaking} breaking change${stats.breaking === 1 ? "" : "s"}`;
    }
  } else if (stats.features > 0) {
    level = "minor";
    reason = `${stats.features} feature${stats.features === 1 ? "" : "s"}`;
  } else if (stats.fixes > 0) {
    level = "patch";
    reason = `${stats.fixes} fix${stats.fixes === 1 ? "" : "es"}/perf`;
  } else if (opts.always) {
    level = "patch";
    reason = "no notable commits (--always)";
  } else {
    level = "none";
    reason = "no version-affecting commits";
  }

  let next: string;
  if (level === "none") {
    next = currentStr;
  } else if (opts.preid) {
    next = formatSemver(inc(current, `pre${level}` as const, opts.preid));
  } else {
    next = incStr(current, level);
  }

  return {
    current: currentStr,
    next,
    level,
    reason,
    stats,
    overridden: false,
  };
}
