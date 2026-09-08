/**
 * Tracks everything that has patched a global or an object member so
 * {@link restoreAll} can undo it in one call. Each entry knows how to restore
 * itself and deregisters on restore so it can never double-restore.
 */
export interface Restorable {
  restore(): void;
  /** Optional: clear the recorded history of the spy this entry installed. */
  reset?(): void;
}

const active = new Set<Restorable>();

/** Register a restorable (used by spyOn/stub/useFakeTimers). */
export function register(item: Restorable): void {
  active.add(item);
}

/** Remove a restorable from the registry without restoring it. */
export function deregister(item: Restorable): void {
  active.delete(item);
}

/**
 * Restore every active `spyOn`, `stub` and fake-timer clock, in reverse order
 * of installation (LIFO), then clear the registry. Safe to call repeatedly.
 */
export function restoreAll(): void {
  // Snapshot + reverse so nested/overlapping patches unwind cleanly.
  const items = Array.from(active).reverse();
  active.clear();
  for (const item of items) {
    item.restore();
  }
}

/**
 * Clear the recorded call history of every active `spyOn`/`stub` spy, **without**
 * restoring the originals — the companion of {@link restoreAll} for the common
 * "wipe history between assertions but keep the patches" case. Programmed
 * behaviour and the once-queue are preserved. Standalone `spy()` instances are
 * not tracked here; reset those yourself.
 */
export function resetAll(): void {
  for (const item of active) {
    item.reset?.();
  }
}
