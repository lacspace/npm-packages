/**
 * @lacspace/cache — eviction policies
 *
 * Small, pure helpers that decide which entry to evict when a bounded cache is
 * over capacity. Kept side-effect free so eviction order is unit-testable in
 * isolation from the cache itself.
 */

/** Eviction policy used when a cache exceeds its `max` entry count. */
export type EvictionPolicy = "lru" | "lfu";

/** The minimal metadata `selectLfuVictim` needs from each entry. */
export interface VictimMeta {
  /** Access frequency — the lower it is, the better an eviction candidate. */
  freq: number;
  /** Monotonic creation order — smaller (older) wins ties. */
  seq: number;
}

/**
 * Pick the least-frequently-used key. Ties are broken by the smallest `seq`
 * (the oldest inserted entry), which keeps eviction deterministic. Returns
 * `undefined` for an empty input.
 */
export function selectLfuVictim(
  entries: Iterable<readonly [string, VictimMeta]>,
): string | undefined {
  let victim: string | undefined;
  let best: VictimMeta | undefined;
  for (const [key, meta] of entries) {
    if (
      best === undefined ||
      meta.freq < best.freq ||
      (meta.freq === best.freq && meta.seq < best.seq)
    ) {
      best = meta;
      victim = key;
    }
  }
  return victim;
}
