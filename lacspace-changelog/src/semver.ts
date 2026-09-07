/**
 * A tiny, dependency-free semver engine: parse, compare and increment
 * versions, including prerelease identifiers. Only the parts a release tool
 * needs — not a full spec implementation, but strict about the common shapes.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease identifiers, e.g. ["beta", 0] for `-beta.0`. Empty if none. */
  prerelease: Array<string | number>;
  /** Build metadata after `+`. Empty if none. Ignored in precedence. */
  build: string[];
}

/** The kind of release-level increment to apply. */
export type ReleaseType = "major" | "minor" | "patch";

/** A parsed increment level, including the prerelease variants. */
export type IncrementType =
  | "major"
  | "minor"
  | "patch"
  | "premajor"
  | "preminor"
  | "prepatch"
  | "prerelease";

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parse a semver string. A leading `v`/`V` is tolerated and stripped. Returns
 * `null` when the string is not a valid semver (never throws).
 */
export function parseSemver(input: string): SemVer | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^[vV]/, "");
  const m = SEMVER_RE.exec(raw);
  if (!m) return null;
  const [, maj, min, pat, pre, build] = m;
  const prerelease: Array<string | number> = pre
    ? pre.split(".").map((id) => (/^(0|[1-9]\d*)$/.test(id) ? Number(id) : id))
    : [];
  return {
    major: Number(maj),
    minor: Number(min),
    patch: Number(pat),
    prerelease,
    build: build ? build.split(".") : [],
  };
}

/** Parse or throw a descriptive error. */
export function mustParseSemver(input: string): SemVer {
  const v = parseSemver(input);
  if (!v) throw new Error(`Not a valid semver version: "${input}"`);
  return v;
}

/** True when `input` is a valid semver (leading `v` allowed). */
export function isValidSemver(input: string): boolean {
  return parseSemver(input) !== null;
}

/** Render a SemVer back to a canonical string (no leading `v`). */
export function formatSemver(v: SemVer): string {
  let s = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease.length) s += `-${v.prerelease.join(".")}`;
  if (v.build.length) s += `+${v.build.join(".")}`;
  return s;
}

function comparePre(
  a: Array<string | number>,
  b: Array<string | number>,
): number {
  // A version with a prerelease has LOWER precedence than one without.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const x = a[i]!;
    const y = b[i]!;
    const xNum = typeof x === "number";
    const yNum = typeof y === "number";
    if (xNum && yNum) {
      if (x !== y) return (x as number) < (y as number) ? -1 : 1;
    } else if (xNum !== yNum) {
      // numeric identifiers always have lower precedence than alphanumeric
      return xNum ? -1 : 1;
    } else {
      const xs = String(x);
      const ys = String(y);
      if (xs !== ys) return xs < ys ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Compare two versions by precedence. Returns -1, 0 or 1. Build metadata is
 * ignored per the semver spec. Accepts strings or parsed SemVers.
 */
export function compareSemver(
  a: SemVer | string,
  b: SemVer | string,
): number {
  const va = typeof a === "string" ? mustParseSemver(a) : a;
  const vb = typeof b === "string" ? mustParseSemver(b) : b;
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  return comparePre(va.prerelease, vb.prerelease);
}

/** True when a > b. */
export function gt(a: SemVer | string, b: SemVer | string): boolean {
  return compareSemver(a, b) > 0;
}

/** Return the greatest version in the list, or null if empty/all invalid. */
export function maxSemver(versions: string[]): string | null {
  let best: SemVer | null = null;
  let bestRaw: string | null = null;
  for (const raw of versions) {
    const v = parseSemver(raw);
    if (!v) continue;
    if (!best || compareSemver(v, best) > 0) {
      best = v;
      bestRaw = formatSemver(v);
    }
  }
  return bestRaw;
}

function nextPreNumber(
  pre: Array<string | number>,
  preid?: string,
): Array<string | number> {
  // Bump an existing prerelease. If a preid is given and matches the head,
  // increment the trailing number; otherwise start a fresh <preid>.0 (or a
  // bare numeric prerelease when no preid).
  if (preid) {
    if (pre.length && pre[0] === preid) {
      const rest = pre.slice(1);
      const lastIdx = rest.length - 1;
      if (lastIdx >= 0 && typeof rest[lastIdx] === "number") {
        rest[lastIdx] = (rest[lastIdx] as number) + 1;
        return [preid, ...rest];
      }
      return [preid, 0];
    }
    return [preid, 0];
  }
  // No preid: bump the last numeric identifier, else append 0.
  if (pre.length) {
    const copy = pre.slice();
    const lastIdx = copy.length - 1;
    if (typeof copy[lastIdx] === "number") {
      copy[lastIdx] = (copy[lastIdx] as number) + 1;
      return copy;
    }
    return [...copy, 0];
  }
  return [0];
}

/**
 * Increment a version. Mirrors the familiar `semver.inc` behaviour:
 *
 * - `major`/`minor`/`patch` on a version WITH a prerelease and no further
 *   change simply drops the prerelease if the base already matches; otherwise
 *   it rolls the number as usual.
 * - `premajor`/`preminor`/`prepatch` roll the base then start `-<preid>.0`.
 * - `prerelease` bumps an existing prerelease, or, on a stable version, rolls
 *   the patch and starts `-<preid>.0`.
 */
export function inc(
  input: SemVer | string,
  type: IncrementType,
  preid?: string,
): SemVer {
  const v = typeof input === "string" ? mustParseSemver(input) : input;
  const base: SemVer = {
    major: v.major,
    minor: v.minor,
    patch: v.patch,
    prerelease: [],
    build: [],
  };
  const hasPre = v.prerelease.length > 0;

  switch (type) {
    case "major":
      if (hasPre && v.minor === 0 && v.patch === 0) {
        // e.g. 2.0.0-beta.1 -> 2.0.0
        return { ...base };
      }
      return { ...base, major: v.major + 1, minor: 0, patch: 0 };
    case "minor":
      if (hasPre && v.patch === 0) {
        return { ...base };
      }
      return { ...base, minor: v.minor + 1, patch: 0 };
    case "patch":
      if (hasPre) {
        // dropping the prerelease releases the same base
        return { ...base };
      }
      return { ...base, patch: v.patch + 1 };
    case "premajor":
      return {
        ...base,
        major: v.major + 1,
        minor: 0,
        patch: 0,
        prerelease: nextPreNumber([], preid),
      };
    case "preminor":
      return {
        ...base,
        minor: v.minor + 1,
        patch: 0,
        prerelease: nextPreNumber([], preid),
      };
    case "prepatch":
      return {
        ...base,
        patch: v.patch + 1,
        prerelease: nextPreNumber([], preid),
      };
    case "prerelease":
      if (hasPre) {
        return { ...base, prerelease: nextPreNumber(v.prerelease, preid) };
      }
      return {
        ...base,
        patch: v.patch + 1,
        prerelease: nextPreNumber([], preid),
      };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown increment type: ${String(_exhaustive)}`);
    }
  }
}

/** Convenience: increment and stringify. */
export function incStr(
  input: SemVer | string,
  type: IncrementType,
  preid?: string,
): string {
  return formatSemver(inc(input, type, preid));
}
