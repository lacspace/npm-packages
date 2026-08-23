/**
 * @lacspace/humanize
 *
 * Turn machine values into human-readable text — bytes, durations, relative
 * time, ordinals, plurals, compact numbers and grammatical lists.
 * Zero dependencies, isomorphic.
 */

/* ------------------------------ bytes ------------------------------ */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
const BYTE_UNITS_IEC = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];

export interface BytesOptions {
  /** Use 1024-based IEC units (KiB, MiB…). Default false (1000-based). */
  binary?: boolean;
  /** Decimal places. Default 1 (0 for bytes). */
  decimals?: number;
}

/** Human-readable file size. `bytes(1536)` → "1.5 KB". */
export function bytes(n: number, opts: BytesOptions = {}): string {
  const base = opts.binary ? 1024 : 1000;
  const units = opts.binary ? BYTE_UNITS_IEC : BYTE_UNITS;
  const neg = n < 0 ? "-" : "";
  let v = Math.abs(n);
  if (v < base) return `${neg}${v} B`;
  let i = 0;
  while (v >= base && i < units.length - 1) { v /= base; i++; }
  const dp = opts.decimals ?? 1;
  return `${neg}${v.toFixed(dp)} ${units[i]}`;
}

/** Parse a size string back to bytes. `parseBytes("1.5 KB")` → 1500. */
export function parseBytes(input: string): number {
  const m = /^\s*(-?[\d.]+)\s*([a-z]+)?\s*$/i.exec(input);
  if (!m) return NaN;
  const value = parseFloat(m[1]!);
  const unit = (m[2] ?? "B").toUpperCase();
  const binary = unit.includes("I");
  const idx = (binary ? BYTE_UNITS_IEC : BYTE_UNITS).findIndex((u) => u.toUpperCase() === unit);
  if (idx === -1) return unit === "B" ? value : NaN;
  return value * (binary ? 1024 : 1000) ** idx;
}

/* ------------------------------ duration ------------------------------ */

const DUR = [
  { u: "y", ms: 31536000000, long: "year" },
  { u: "mo", ms: 2592000000, long: "month" },
  { u: "d", ms: 86400000, long: "day" },
  { u: "h", ms: 3600000, long: "hour" },
  { u: "m", ms: 60000, long: "minute" },
  { u: "s", ms: 1000, long: "second" },
  { u: "ms", ms: 1, long: "millisecond" },
];

export interface DurationOptions {
  /** Max number of units to show. Default 2. */
  units?: number;
  /** Use full words ("2 hours 3 minutes"). Default false ("2h 3m"). */
  long?: boolean;
}

/** Human-readable duration. `duration(90061000)` → "1d 1h". */
export function duration(ms: number, opts: DurationOptions = {}): string {
  const max = opts.units ?? 2;
  let rem = Math.abs(Math.round(ms));
  if (rem === 0) return opts.long ? "0 seconds" : "0s";
  const parts: string[] = [];
  for (const d of DUR) {
    if (rem < d.ms) continue;
    const count = Math.floor(rem / d.ms);
    rem -= count * d.ms;
    parts.push(opts.long ? `${count} ${plural(d.long, count)}` : `${count}${d.u}`);
    if (parts.length >= max) break;
  }
  return (ms < 0 ? "-" : "") + parts.join(opts.long ? " " : " ");
}

/* ------------------------------ relative time ------------------------------ */

const RT: [number, string][] = [
  [31536000, "year"], [2592000, "month"], [604800, "week"],
  [86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"],
];

/** Relative time. `relativeTime(Date.now() - 3600e3)` → "1 hour ago". */
export function relativeTime(date: Date | number | string, base: Date | number = Date.now()): string {
  const t = date instanceof Date ? date.getTime() : typeof date === "string" ? new Date(date).getTime() : date;
  const b = base instanceof Date ? base.getTime() : base;
  const diff = Math.round((b - t) / 1000);
  const abs = Math.abs(diff);
  if (abs < 5) return "just now";
  for (const [secs, unit] of RT) {
    if (abs >= secs) {
      const count = Math.floor(abs / secs);
      const label = `${count} ${plural(unit, count)}`;
      return diff >= 0 ? `${label} ago` : `in ${label}`;
    }
  }
  return "just now";
}

/* ------------------------------ numbers ------------------------------ */

/** Ordinal suffix. `ordinal(21)` → "21st". */
export function ordinal(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  const suffix = abs >= 11 && abs <= 13 ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Compact number. `compact(1234567)` → "1.2M". */
export function compact(n: number, decimals = 1): string {
  const neg = n < 0 ? "-" : "";
  const v = Math.abs(n);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [threshold, u] of units) {
    if (v >= threshold) {
      const num = v / threshold;
      return `${neg}${(num % 1 === 0 ? num.toFixed(0) : num.toFixed(decimals))}${u}`;
    }
  }
  return `${neg}${v}`;
}

/** Group digits with separators. `number(1234567.5)` → "1,234,567.5". */
export function number(n: number, opts: { separator?: string; decimal?: string } = {}): string {
  const sep = opts.separator ?? ",";
  const dec = opts.decimal ?? ".";
  const [int, frac] = String(n).split(".");
  const sign = int!.startsWith("-") ? "-" : "";
  const digits = int!.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return sign + digits + (frac ? dec + frac : "");
}

/* ------------------------------ words ------------------------------ */

/** Pluralize a word for a count (naive English + irregulars). */
export function plural(word: string, count: number, pluralForm?: string): string {
  if (count === 1) return word;
  if (pluralForm) return pluralForm;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** "5 items" / "1 item". */
export function pluralize(count: number, word: string, pluralForm?: string): string {
  return `${count} ${plural(word, count, pluralForm)}`;
}

/** Grammatical list. `list(["a","b","c"])` → "a, b and c". */
export function list(items: string[], opts: { conjunction?: string; oxford?: boolean } = {}): string {
  const conj = opts.conjunction ?? "and";
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  const head = items.slice(0, -1).join(", ");
  return `${head}${opts.oxford ? "," : ""} ${conj} ${items[items.length - 1]}`;
}

/** Truncate to a max length with an ellipsis on a word boundary. */
export function truncate(text: string, maxLength: number, ellipsis = "…"): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - ellipsis.length);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "") + ellipsis;
}

/** Title Case a string. */
export function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
