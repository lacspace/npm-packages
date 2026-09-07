import { registerResetter } from "./state";

/** A reusable, auto-incrementing generator produced by {@link sequence}. */
export interface Sequence<T = number> {
  /** Return the next value (1-based), applying the mapper if one was given. */
  (): T;
  /** Reset this counter to its start, independent of `resetSequences()`. */
  reset(): void;
  /** The next `n` this generator will use (without advancing it). */
  readonly peek: number;
}

/**
 * Create a standalone auto-incrementing generator for id/email-style fields.
 *
 * ```ts
 * const email = sequence((n) => `user${n}@example.com`);
 * email(); // "user1@example.com"
 * email(); // "user2@example.com"
 * ```
 *
 * Registered globally, so `resetSequences()` resets it alongside factory
 * sequences. `start` defaults to `1`.
 */
export function sequence<T = number>(
  fn?: (n: number) => T,
  start = 1,
): Sequence<T> {
  let n = start - 1;
  const gen = (() => {
    n += 1;
    return (fn ? fn(n) : (n as unknown as T));
  }) as Sequence<T>;
  gen.reset = () => {
    n = start - 1;
  };
  Object.defineProperty(gen, "peek", { get: () => n + 1, enumerable: true });
  registerResetter(gen.reset);
  return gen;
}
