import type { InstalledPackage } from "./inventory.js";
import { compareVersions } from "./duplicates.js";

/** How far behind an installed package is from the registry's latest. */
export type OutdatedLevel = "up-to-date" | "patch" | "minor" | "major" | "unknown";

export interface OutdatedEntry {
  name: string;
  current: string;
  latest: string | null;
  level: OutdatedLevel;
  error?: string;
}

export interface OutdatedReport {
  entries: OutdatedEntry[];
  /** Count of entries that are behind by a major version. */
  majors: number;
  /** Count of any-behind (patch+minor+major). */
  behind: number;
}

/** A minimal fetch signature so tests can inject a mock. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface OutdatedOptions {
  registry?: string;
  /** Injected fetch (defaults to global fetch). */
  fetchImpl?: FetchLike;
  /** Max concurrent registry requests. Default 8. */
  concurrency?: number;
  /** Per-request timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Only check these names (defaults to all direct deps in the list). */
  names?: string[];
}

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a version into numeric parts, stripping any range prefix / pre-release. */
export function parseSemver(version: string): SemverParts | null {
  const m = version.replace(/^[v^~>=<\s]+/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Classify how far `current` is behind `latest`. */
export function diffLevel(current: string, latest: string): OutdatedLevel {
  const a = parseSemver(current);
  const b = parseSemver(latest);
  if (!a || !b) return "unknown";
  if (compareVersions(latest, current) <= 0) return "up-to-date";
  if (b.major > a.major) return "major";
  if (b.minor > a.minor) return "minor";
  if (b.patch > a.patch) return "patch";
  return "up-to-date";
}

const ABBREV = { Accept: "application/vnd.npm.install-v1+json" };

/**
 * Fetch the `latest` dist-tag for one package from an npm-compatible registry.
 * Returns null on any network/parse error (never throws). Honours a timeout via
 * AbortController.
 */
export async function fetchLatest(
  name: string,
  opts: OutdatedOptions = {},
): Promise<string | null> {
  const registry = (opts.registry ?? "https://registry.npmjs.org").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!fetchImpl) throw new Error("No fetch implementation available (Node >= 18 required).");
  const url = `${registry}/${name.replace("/", "%2F")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: ABBREV });
    if (!res.ok) return null;
    const body = (await res.json()) as { "dist-tags"?: { latest?: string } };
    const latest = body?.["dist-tags"]?.latest;
    return typeof latest === "string" ? latest : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run an async worker over a list with a fixed concurrency limit. */
async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let idx = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Check installed direct dependencies against the registry's latest version.
 * This is the ONLY networked feature; everything else in the tool is offline.
 * Dedupes by name (checks the top-level installed version).
 */
export async function checkOutdated(
  installed: InstalledPackage[],
  opts: OutdatedOptions = {},
): Promise<OutdatedReport> {
  const nameFilter = opts.names ? new Set(opts.names) : null;
  // one version per name: prefer the shallowest (top-level) install
  const byName = new Map<string, InstalledPackage>();
  for (const p of installed) {
    if (nameFilter && !nameFilter.has(p.name)) continue;
    if (!nameFilter && !p.direct) continue;
    const existing = byName.get(p.name);
    if (!existing || p.depth < existing.depth) byName.set(p.name, p);
  }
  const targets = [...byName.values()];

  const entries = await pool(targets, opts.concurrency ?? 8, async (p) => {
    const latest = await fetchLatest(p.name, opts);
    const level: OutdatedLevel = latest ? diffLevel(p.version, latest) : "unknown";
    const entry: OutdatedEntry = { name: p.name, current: p.version, latest, level };
    if (!latest) entry.error = "no latest version (network or unpublished)";
    return entry;
  });

  entries.sort((a, b) => rank(b.level) - rank(a.level) || a.name.localeCompare(b.name));
  const majors = entries.filter((e) => e.level === "major").length;
  const behind = entries.filter(
    (e) => e.level === "major" || e.level === "minor" || e.level === "patch",
  ).length;
  return { entries, majors, behind };
}

function rank(level: OutdatedLevel): number {
  return { major: 4, minor: 3, patch: 2, unknown: 1, "up-to-date": 0 }[level];
}
