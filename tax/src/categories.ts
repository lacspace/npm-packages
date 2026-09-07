/**
 * Tax categories / rate tables.
 *
 * A tiny, caller-supplied structure for looking up the applicable rate by
 * category (e.g. `"standard"`, `"reduced"`, `"food"`) and, optionally, region
 * (e.g. `"CA"`, `"NY"`). Nothing here is hard-coded — you own the numbers; these
 * helpers just resolve them predictably with a documented fallback order.
 */

function assertRate(rate: number): void {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) {
    throw new RangeError(`rate must be a finite number >= 0, got ${rate}`);
  }
}

/**
 * A caller-supplied rate table.
 *
 * `categories[category]` is either a flat rate (a `number`) or a per-region map
 * of `region → rate` (with an optional `"default"` region key). `default` is
 * the table-wide fallback used when a category (or a region within it) misses.
 *
 * ```ts
 * const table: RateTable = {
 *   default: 0.2,
 *   categories: {
 *     standard: 0.2,
 *     reduced: 0.05,
 *     food: { default: 0, NY: 0, CA: 0.0725 },
 *   },
 * };
 * ```
 */
export interface RateTable {
  /** Table-wide fallback rate when a lookup misses. */
  default?: number;
  /** category → flat rate, or category → (region → rate). */
  categories: Record<string, number | Record<string, number>>;
}

/**
 * Look up the applicable rate for `category` (and optional `region`) and return
 * it, or `undefined` if nothing matches and there is no `default`.
 *
 * Resolution order:
 * 1. the category's region entry (when the category is a region map and
 *    `region` is given),
 * 2. the region map's `"default"` entry,
 * 3. the category's flat rate (when the category is a plain number),
 * 4. the table's top-level `default`,
 * 5. `undefined`.
 */
export function lookupRate(table: RateTable, category: string, region?: string): number | undefined {
  const entry = table.categories[category];
  if (typeof entry === "number") return entry;
  if (entry && typeof entry === "object") {
    if (region !== undefined && Object.prototype.hasOwnProperty.call(entry, region)) {
      return entry[region];
    }
    if (Object.prototype.hasOwnProperty.call(entry, "default")) {
      return entry["default"];
    }
  }
  return table.default;
}

/**
 * Like {@link lookupRate} but always returns a usable rate: throws a
 * `RangeError` if nothing matches (no category entry, no region, no `default`),
 * and validates that the resolved value is a finite rate `>= 0`.
 */
export function resolveRate(table: RateTable, category: string, region?: string): number {
  const rate = lookupRate(table, category, region);
  if (rate === undefined) {
    const where = region !== undefined ? `${category}/${region}` : category;
    throw new RangeError(`no rate found for "${where}" and the table has no default`);
  }
  assertRate(rate);
  return rate;
}
