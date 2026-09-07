/**
 * Global, mutable suite state: the base seed and every registered sequence
 * counter. Kept in one module so `seed()` and `resetSequences()` are simple
 * top-level functions a test suite can call between cases.
 */

let baseSeed = 0x9e3779b9; // a fixed, arbitrary default so runs are stable out of the box

/** Every registered "reset to initial" callback (factory + standalone sequences). */
const resetters = new Set<() => void>();

/** Set the base seed used to derive every build's deterministic RNG stream. */
export function seed(n: number): void {
  baseSeed = n >>> 0;
}

/** The current base seed. */
export function getBaseSeed(): number {
  return baseSeed;
}

/**
 * Reset every sequence counter (factory `ctx.sequence` counters and standalone
 * `sequence()` generators) back to its starting point. Call this between tests
 * to make each case reproducible.
 */
export function resetSequences(): void {
  for (const reset of resetters) reset();
}

/** Register a resetter; returns an unregister function. */
export function registerResetter(fn: () => void): () => void {
  resetters.add(fn);
  return () => resetters.delete(fn);
}
