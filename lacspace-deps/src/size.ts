import { readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import type { InstalledPackage } from "./inventory.js";

/** Install size + file count for one package. */
export interface SizeEntry {
  name: string;
  version: string;
  path: string;
  bytes: number;
  files: number;
}

export interface SizeReport {
  entries: SizeEntry[];
  totalBytes: number;
  totalFiles: number;
  /** Rough gzip estimate of the total (≈32% of raw), when requested. */
  gzipEstimateBytes?: number;
}

export interface SizeOptions {
  /** Include a rough gzip-size estimate on the report. */
  gzip?: boolean;
  /** Limit entries returned (heaviest first). Default: all. */
  top?: number;
}

/**
 * Recursively sum file sizes + count files under a directory, WITHOUT
 * descending into nested `node_modules` (those are counted as their own
 * packages). Symlinks are not followed. Never throws — unreadable entries are
 * skipped.
 */
export function dirSize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry);
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (entry === "node_modules") continue; // counted separately
        stack.push(full);
      } else if (st.isFile()) {
        bytes += st.size;
        files++;
      }
    }
  }
  return { bytes, files };
}

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

/**
 * Compute install sizes for each installed package (one entry per distinct
 * install location), sorted heaviest-first.
 */
export function measureSizes(
  installed: InstalledPackage[],
  opts: SizeOptions = {},
): SizeReport {
  const entries: SizeEntry[] = [];
  let totalBytes = 0;
  let totalFiles = 0;
  for (const p of installed) {
    const { bytes, files } = dirSize(p.dir);
    totalBytes += bytes;
    totalFiles += files;
    entries.push({ name: p.name, version: p.version, path: p.path, bytes, files });
  }
  entries.sort((a, b) => b.bytes - a.bytes);
  const limited = opts.top && opts.top > 0 ? entries.slice(0, opts.top) : entries;
  const report: SizeReport = {
    entries: limited,
    totalBytes,
    totalFiles,
  };
  if (opts.gzip) report.gzipEstimateBytes = Math.round(totalBytes * 0.32);
  return report;
}
