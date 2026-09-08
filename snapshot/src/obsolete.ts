/**
 * Obsolete-snapshot detection — pure, isomorphic helpers that compare the set of
 * snapshot keys *stored* in a `.snap` file against the keys *used* during a run,
 * so you can surface (or prune) entries that no longer correspond to a test.
 *
 * These operate on the plain `name -> snapshot` map produced by
 * {@link parseSnapshotFile}, so they work in any environment (no filesystem).
 */

/** The outcome of comparing stored snapshot keys against the keys used in a run. */
export interface ObsoleteReport {
  /** Keys present in the file but never exercised this run (safe to prune). */
  obsolete: string[];
  /** Keys exercised this run but not yet stored (would be written on this run). */
  missing: string[];
  /** Keys both stored and exercised. */
  matched: string[];
  /** Number of keys stored in the file. */
  storedCount: number;
  /** Number of distinct keys exercised this run. */
  usedCount: number;
}

/**
 * Compare stored snapshot keys against the keys used during a run.
 *
 * @param stored A `name -> snapshot` map (e.g. from {@link parseSnapshotFile}).
 * @param used   The snapshot keys actually exercised this run.
 *
 * @example
 * const report = findObsoleteSnapshots(parseSnapshotFile(text), usedKeys);
 * if (report.obsolete.length) console.warn("Obsolete snapshots:", report.obsolete);
 */
export function findObsoleteSnapshots(
  stored: Record<string, string>,
  used: Iterable<string>,
): ObsoleteReport {
  const usedSet = new Set(used);
  const storedKeys = Object.keys(stored);

  const obsolete: string[] = [];
  const matched: string[] = [];
  for (const key of storedKeys) {
    if (usedSet.has(key)) matched.push(key);
    else obsolete.push(key);
  }

  const missing: string[] = [];
  for (const key of usedSet) {
    if (!Object.prototype.hasOwnProperty.call(stored, key)) missing.push(key);
  }

  obsolete.sort();
  matched.sort();
  missing.sort();

  return {
    obsolete,
    missing,
    matched,
    storedCount: storedKeys.length,
    usedCount: usedSet.size,
  };
}

/**
 * Return a copy of `stored` with obsolete keys (present but not in `used`)
 * removed — the pruned map you would write back to the `.snap` file. The input
 * map is not mutated.
 */
export function pruneSnapshots(
  stored: Record<string, string>,
  used: Iterable<string>,
): Record<string, string> {
  const usedSet = new Set(used);
  const out: Record<string, string> = {};
  for (const key of Object.keys(stored)) {
    if (usedSet.has(key)) out[key] = stored[key]!;
  }
  return out;
}
