/**
 * Human-readable size parsing and formatting.
 *
 * Parsing accepts decimal (SI: kb=1000) and binary (IEC: kib=1024) units, is
 * case-insensitive, and tolerates an optional space between number and unit.
 * Formatting produces a compact string in either base.
 */

/** Decimal (SI) unit multipliers — kb = 1000 bytes. */
const DECIMAL: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
};

/** Binary (IEC) unit multipliers — kib = 1024 bytes. */
const BINARY: Record<string, number> = {
  b: 1,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
};

/**
 * Parse a human size string (or a bare number of bytes) into a byte count.
 *
 * - Bare numbers and `"b"` are treated as bytes.
 * - `kb`/`mb`/`gb`/`tb` are decimal (×1000).
 * - `kib`/`mib`/`gib`/`tib` are binary (×1024).
 * - `k`/`m`/`g`/`t` (single letter) are treated as **binary** for convenience.
 *
 * Throws on anything it cannot parse.
 */
export function parseSize(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error(`Invalid size: ${input}`);
    return Math.round(input);
  }
  const raw = String(input).trim().toLowerCase();
  if (raw === "") throw new Error("Empty size");
  const m = raw.match(/^([0-9]*\.?[0-9]+)\s*([a-z]*)$/);
  if (!m) throw new Error(`Invalid size: "${input}"`);
  const value = Number(m[1]);
  const unit = m[2] ?? "";
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid size: "${input}"`);
  if (unit === "" || unit === "b") return Math.round(value);
  // Single-letter shorthands map to binary (developer intuition: 200k ≈ 200KiB).
  const shorthand: Record<string, string> = { k: "kib", m: "mib", g: "gib", t: "tib" };
  const u = shorthand[unit] ?? unit;
  const mult = BINARY[u] ?? DECIMAL[u];
  if (mult === undefined) throw new Error(`Unknown size unit: "${unit}"`);
  return Math.round(value * mult);
}

export interface FormatSizeOptions {
  /** Use binary (KiB/MiB) units instead of decimal (kB/MB). Default false. */
  binary?: boolean;
  /** Significant fraction digits for values >= 1 unit. Default 2 (trailing zeros trimmed). */
  precision?: number;
}

/**
 * Format a byte count into a compact human string, e.g. `1.5 kB` or `1.46 KiB`.
 * Bytes below one unit are shown as an integer count of `B`.
 */
export function formatSize(bytes: number, opts: FormatSizeOptions = {}): string {
  const binary = opts.binary ?? false;
  const precision = opts.precision ?? 2;
  const n = Math.max(0, Math.round(bytes));
  const base = binary ? 1024 : 1000;
  const units = binary ? ["B", "KiB", "MiB", "GiB", "TiB"] : ["B", "kB", "MB", "GB", "TB"];
  if (n < base) return `${n} B`;
  let value = n;
  let i = 0;
  while (value >= base && i < units.length - 1) {
    value /= base;
    i++;
  }
  const fixed = value.toFixed(precision);
  // Trim trailing zeros and any dangling decimal point.
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `${trimmed} ${units[i]}`;
}

/** Format a signed byte delta, always showing the sign, e.g. `+1.2 kB` / `-340 B`. */
export function formatDelta(bytes: number, opts: FormatSizeOptions = {}): string {
  const sign = bytes > 0 ? "+" : bytes < 0 ? "-" : "";
  return `${sign}${formatSize(Math.abs(bytes), opts)}`;
}
