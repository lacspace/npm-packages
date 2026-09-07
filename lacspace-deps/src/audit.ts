import { buildInventory } from "./inventory.js";
import type { Inventory } from "./inventory.js";
import { summarizeLicenses } from "./licenses.js";
import type { LicensePolicy, LicenseSummary } from "./licenses.js";
import { measureSizes } from "./size.js";
import type { SizeReport } from "./size.js";
import { findDuplicates } from "./duplicates.js";
import type { DuplicateEntry } from "./duplicates.js";
import { analyzeUsage } from "./usage.js";
import type { UsageReport } from "./usage.js";
import { checkOutdated } from "./outdated.js";
import type { OutdatedReport, OutdatedOptions } from "./outdated.js";

/** Categories a `--fail-on` gate can target. */
export type FailOn = "unused" | "missing" | "license" | "outdated" | "duplicates";

export interface AuditOptions {
  prod?: boolean;
  policy?: LicensePolicy;
  gzip?: boolean;
  /** Also run the (networked) outdated check with these options. */
  outdated?: OutdatedOptions | false;
  usage?: { ignoreUnused?: string[]; noToolingIgnore?: boolean };
}

/** The complete audit result. */
export interface AuditReport {
  root: string;
  projectName: string | null;
  projectVersion: string | null;
  lockfileType: Inventory["lockfileType"];
  hasNodeModules: boolean;
  counts: {
    declared: number;
    installed: number;
    distinct: number;
  };
  licenses: LicenseSummary;
  size: SizeReport;
  duplicates: DuplicateEntry[];
  usage: UsageReport;
  outdated?: OutdatedReport;
  /** 0-100 health score derived from findings. */
  health: number;
}

/**
 * Run the full offline audit for a project directory (licences, size,
 * duplicates, unused/missing), plus the opt-in networked outdated check when
 * `opts.outdated` is provided. Pure aside from fs reads (and the registry calls
 * that only the outdated check makes).
 */
export async function audit(dir: string, opts: AuditOptions = {}): Promise<AuditReport> {
  const inv = buildInventory(dir, { ...(opts.prod ? { prod: true } : {}) });
  const licenses = summarizeLicenses(inv.installed, opts.policy ?? {});
  const size = measureSizes(inv.installed, opts.gzip ? { gzip: true } : {});
  const duplicates = findDuplicates(inv.installed);
  const usage = analyzeUsage(dir, inv.declared, {
    ...(opts.usage ?? {}),
    selfName: inv.projectName,
  });

  const distinct = new Set(inv.installed.map((p) => `${p.name}@${p.version}`)).size;

  const report: AuditReport = {
    root: inv.root,
    projectName: inv.projectName,
    projectVersion: inv.projectVersion,
    lockfileType: inv.lockfileType,
    hasNodeModules: inv.hasNodeModules,
    counts: {
      declared: inv.declared.length,
      installed: inv.installed.length,
      distinct,
    },
    licenses,
    size,
    duplicates,
    usage,
    health: 0,
  };

  if (opts.outdated) {
    report.outdated = await checkOutdated(inv.installed, opts.outdated);
  }

  report.health = healthScore(report);
  return report;
}

/**
 * A 0-100 hygiene score. Starts at 100 and deducts for policy violations,
 * unknown/copyleft licences, duplicates, unused/missing deps and outdated
 * majors. Clamped to [0, 100].
 */
export function healthScore(r: AuditReport): number {
  let score = 100;
  score -= r.licenses.violations.length * 12;
  score -= r.licenses.totals["strong-copyleft"] * 6;
  score -= r.licenses.totals["weak-copyleft"] * 2;
  score -= Math.min(r.licenses.totals.unknown, 10) * 1;
  score -= r.duplicates.length * 3;
  score -= r.usage.unused.length * 2;
  score -= r.usage.missing.length * 5;
  if (r.outdated) score -= r.outdated.majors * 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Decide whether the audit should exit non-zero, given the requested gates.
 * Licence policy violations ALWAYS fail. `failOn` adds category gates.
 */
export function shouldFail(report: AuditReport, failOn: FailOn[]): boolean {
  if (report.licenses.violations.length > 0) return true;
  for (const gate of failOn) {
    if (gate === "license" && report.licenses.violations.length > 0) return true;
    if (gate === "unused" && report.usage.unused.length > 0) return true;
    if (gate === "missing" && report.usage.missing.length > 0) return true;
    if (gate === "duplicates" && report.duplicates.length > 0) return true;
    if (gate === "outdated" && report.outdated && report.outdated.majors > 0) return true;
  }
  return false;
}
