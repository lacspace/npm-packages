import type { InstalledPackage } from "./inventory.js";

/** A package installed at more than one version. */
export interface DuplicateEntry {
  name: string;
  /** Distinct versions found, sorted. */
  versions: string[];
  /** Where each copy lives (node_modules-relative paths), grouped by version. */
  locations: Record<string, string[]>;
  /** Total number of installed copies across all versions. */
  copies: number;
}

/**
 * Find packages installed at multiple *distinct* versions — a common source of
 * bloat and subtle bugs (two incompatible copies of the same library). Packages
 * present multiple times at the *same* version (npm dedupe leftovers) are not
 * flagged as version-duplicates but do count toward `copies`.
 */
export function findDuplicates(installed: InstalledPackage[]): DuplicateEntry[] {
  const byName = new Map<string, InstalledPackage[]>();
  for (const p of installed) {
    const arr = byName.get(p.name);
    if (arr) arr.push(p);
    else byName.set(p.name, [p]);
  }

  const out: DuplicateEntry[] = [];
  for (const [name, copies] of byName) {
    const versions = [...new Set(copies.map((c) => c.version))].sort(compareVersions);
    if (versions.length < 2) continue;
    const locations: Record<string, string[]> = {};
    for (const v of versions) {
      locations[v] = copies.filter((c) => c.version === v).map((c) => c.path).sort();
    }
    out.push({ name, versions, locations, copies: copies.length });
  }
  out.sort((a, b) => b.versions.length - a.versions.length || a.name.localeCompare(b.name));
  return out;
}

/** Numeric-aware version comparison (best-effort, no pre-release ordering). */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^[v^~>=<\s]+/, "").split(/[.+-]/);
  const pb = b.replace(/^[v^~>=<\s]+/, "").split(/[.+-]/);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    if (aNum && bNum) {
      if (na !== nb) return na - nb;
    } else {
      const sa = pa[i] ?? "";
      const sb = pb[i] ?? "";
      if (sa !== sb) return sa < sb ? -1 : 1;
    }
  }
  return 0;
}
