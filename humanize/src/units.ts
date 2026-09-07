/**
 * Unit humanizers — a generic `unit()`, SI-prefix `metric()`/`si()`, plus a few
 * common ready-made helpers (`distance`, `weight`, `temperature`).
 *
 * `metric()` uses lowercase SI prefixes (`1500` → "1.5k"), distinct from
 * `compact()` which uses the uppercase short-scale style ("1.5K").
 */

import { number, plural } from "./index";

const SI_LARGE: [number, string][] = [
  [1e24, "Y"], [1e21, "Z"], [1e18, "E"], [1e15, "P"],
  [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"],
];
const SI_SMALL: [number, string][] = [
  [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"],
];

function trim(num: number, dp: number): string {
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(dp);
}

export interface MetricOptions {
  /** Decimal places for the scaled value. Default 1. */
  decimals?: number;
  /** Base unit appended after the SI prefix (e.g. "m" → "1.5 km"); adds a space. */
  unit?: string;
  /** Force a space between the number and prefix even without a `unit`. */
  space?: boolean;
}

/** SI-prefix format. `metric(1500)` → "1.5k", `metric(1500, { unit: "m" })` → "1.5 km". */
export function metric(n: number, opts: MetricOptions = {}): string {
  const dp = opts.decimals ?? 1;
  const neg = n < 0 ? "-" : "";
  const v = Math.abs(n);
  const gap = opts.unit || opts.space ? " " : "";
  const suffix = opts.unit ?? "";
  if (v === 0 || !Number.isFinite(v)) return `${neg}${v}${gap}${suffix}`;
  for (const [th, p] of SI_LARGE) {
    if (v >= th) return `${neg}${trim(v / th, dp)}${gap}${p}${suffix}`;
  }
  if (v >= 1) return `${neg}${trim(v, dp)}${gap}${suffix}`;
  for (const [th, p] of SI_SMALL) {
    if (v >= th) return `${neg}${trim(v / th, dp)}${gap}${p}${suffix}`;
  }
  return `${neg}${trim(v, dp)}${gap}${suffix}`;
}

/** Alias of {@link metric}. */
export const si = metric;

export interface UnitOptions {
  /** Round the value to this many decimals before formatting. */
  decimals?: number;
  /** Separator between value and unit. Default " ". */
  separator?: string;
  /** Explicit plural form, or `false` to never pluralize (e.g. a symbol like "kg"). */
  plural?: string | false;
}

/** Generic unit formatter. `unit(3, "meter")` → "3 meters", `unit(1, "meter")` → "1 meter". */
export function unit(value: number, unitName: string, opts: UnitOptions = {}): string {
  const v = opts.decimals != null ? Number(value.toFixed(opts.decimals)) : value;
  const sep = opts.separator ?? " ";
  const name = opts.plural === false ? unitName : plural(unitName, v, opts.plural || undefined);
  return `${number(v)}${sep}${name}`;
}

/** Distance from metres, SI-scaled. `distance(1500)` → "1.5 km". */
export function distance(meters: number, opts: MetricOptions = {}): string {
  return metric(meters, { unit: "m", ...opts });
}

/** Weight from grams, SI-scaled. `weight(1500)` → "1.5 kg". */
export function weight(grams: number, opts: MetricOptions = {}): string {
  return metric(grams, { unit: "g", ...opts });
}

export type TempUnit = "C" | "F" | "K";

/** Temperature. `temperature(20)` → "20°C", `temperature(68, "F")` → "68°F". */
export function temperature(value: number, tempUnit: TempUnit = "C", opts: { decimals?: number } = {}): string {
  const v = opts.decimals != null ? Number(value.toFixed(opts.decimals)) : value;
  return tempUnit === "K" ? `${number(v)} K` : `${number(v)}°${tempUnit}`;
}
