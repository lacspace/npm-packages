/**
 * Lifecycle / teardown hooks for fixtures that touch real resources — a DB row,
 * a temp file, an open handle. A factory's `afterBuild` can `registerCleanup`
 * a disposer; the suite calls `runCleanup()` in an `afterEach`/`afterAll` to
 * tear everything down in reverse (LIFO) order.
 *
 * This is intentionally separate from `resetSequences()`: sequences reset the
 * deterministic counters; cleanup disposes side effects.
 */

/** A teardown function. May be async; its promise is awaited by `runCleanup`. */
export type CleanupFn = () => void | Promise<void>;

/** Every registered teardown, in registration order. */
const cleanups: CleanupFn[] = [];

/**
 * Register a teardown function. Returns an `unregister()` that removes it
 * (e.g. if the resource was disposed early). Later-registered functions run
 * first when {@link runCleanup} is called.
 */
export function registerCleanup(fn: CleanupFn): () => void {
  cleanups.push(fn);
  return () => {
    const i = cleanups.indexOf(fn);
    if (i !== -1) cleanups.splice(i, 1);
  };
}

/** How many teardown functions are currently registered. */
export function cleanupCount(): number {
  return cleanups.length;
}

/** Drop every registered teardown WITHOUT running it. */
export function clearCleanup(): void {
  cleanups.length = 0;
}

/**
 * Run every registered teardown in reverse (LIFO) order, awaiting async ones,
 * then clear the registry. Every function runs even if an earlier one throws;
 * the first error (or an `AggregateError` if several throw) is re-thrown after
 * all have run.
 */
export async function runCleanup(): Promise<void> {
  const pending = cleanups.splice(0, cleanups.length).reverse();
  const errors: unknown[] = [];
  for (const fn of pending) {
    try {
      await fn();
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, `${errors.length} cleanup functions threw`);
  }
}
