/**
 * Human file-size parsing and formatting. Binary units (1 KB = 1024 bytes) to
 * match what operating systems and upload limits usually report.
 */

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  k: 1024,
  kib: 1024,
  mb: 1024 * 1024,
  m: 1024 * 1024,
  mib: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
  gib: 1024 * 1024 * 1024,
};

/** Parse "200kb", "1.5 MB", "500", 4096 → bytes. Throws on nonsense. */
export function parseSize(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) throw new Error(`Invalid size: ${input}`);
    return Math.floor(input);
  }
  const m = String(input).trim().toLowerCase().match(/^([0-9]*\.?[0-9]+)\s*([a-z]*)$/);
  if (!m) throw new Error(`Cannot parse size: "${input}"`);
  const value = parseFloat(m[1]!);
  const unit = m[2] || "b";
  const mult = UNITS[unit];
  if (mult == null) throw new Error(`Unknown size unit: "${unit}"`);
  return Math.floor(value * mult);
}

/** Format a byte count as a short human string, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n.toFixed(decimals).replace(/\.0$/, "")} ${units[u]}`;
}
