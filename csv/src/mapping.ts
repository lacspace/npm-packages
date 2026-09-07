/**
 * @lacspace/csv — column mapping / select
 *
 * Rename headers, select/reorder a subset of columns, and drop columns on
 * object rows. Works on the output of {@link parse} or the input to
 * {@link stringify}, so you can shape data on either side.
 */

import type { Row } from "./index";

export interface MapOptions {
  /**
   * Keep only these source columns, in this order (subset + reorder). When
   * omitted, all columns are kept in their existing order.
   */
  select?: string[];
  /** Rename source columns → new header names (`{ oldName: newName }`). */
  rename?: Record<string, string>;
  /** Source columns to drop. Applied after `select`. */
  drop?: string[];
}

/**
 * Map object rows: select/reorder, drop, then rename columns. Pure — returns
 * new objects and never mutates the input.
 *
 * @example mapColumns(rows, { select: ["id", "name"], rename: { id: "ID" } })
 */
export function mapColumns<T = Row>(rows: Row[], opts: MapOptions = {}): T[] {
  const { select, rename, drop } = opts;
  return rows.map((row) => {
    let keys = select ?? Object.keys(row);
    if (drop && drop.length) keys = keys.filter((k) => !drop.includes(k));
    const out: Row = {};
    for (const k of keys) {
      const nk = rename?.[k] ?? k;
      out[nk] = row[k] ?? "";
    }
    return out as unknown as T;
  });
}
