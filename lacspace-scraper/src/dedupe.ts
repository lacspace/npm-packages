/**
 * Record post-processing: drop duplicates and cap output. Pure and order-stable
 * — the first occurrence of a value wins, later duplicates are removed.
 */
import type { DataRow } from "./convert.js";

export interface DedupeOptions {
  /** Drop records whose value for THIS field was already seen. */
  unique?: string;
  /** Drop records that are byte-for-byte identical to an earlier one. */
  dedupe?: boolean;
  /** Cap the number of records returned. */
  limit?: number;
}

function stable(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * Filter `rows` by uniqueness and/or an output cap. `unique` drops later records
 * sharing a field value (empty/missing values are never treated as duplicates);
 * `dedupe` drops fully-identical records; `limit` caps the count. Returns a new
 * array; the input is untouched.
 */
export function dedupeRecords(rows: DataRow[], opts: DedupeOptions = {}): DataRow[] {
  if (opts.limit === 0) return [];
  const out: DataRow[] = [];
  const seenUnique = new Set<string>();
  const seenFull = new Set<string>();
  for (const row of rows) {
    if (opts.unique) {
      const key = stable(row[opts.unique]);
      if (key !== "") {
        if (seenUnique.has(key)) continue;
        seenUnique.add(key);
      }
    }
    if (opts.dedupe) {
      const key = stable(row);
      if (seenFull.has(key)) continue;
      seenFull.add(key);
    }
    if (opts.limit !== undefined && opts.limit >= 0 && out.length >= opts.limit) break;
    out.push(row);
  }
  return out;
}
