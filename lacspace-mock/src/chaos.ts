/**
 * Pure, seedable helpers for the latency + chaos simulation. Kept free of any
 * timers or sockets so the *decision* (should this response be a delay? an
 * injected error? which status?) can be unit-tested deterministically by
 * passing a fixed RNG — the actual sleeping is done by the caller.
 */

/** A delay spec: a fixed number of ms, or a `[min, max]` jitter range. */
export type Delay = number | [number, number];

/** Chaos (random-failure) configuration. */
export interface ChaosConfig {
  /** Probability in `0..1` that a response is replaced with an error. */
  rate?: number;
  /** The pool of error statuses to pick from (default `[500]`). */
  statuses?: number[];
}

/** The outcome of rolling for chaos on one request. */
export interface ChaosDecision {
  /** Whether this request should be failed. */
  triggered: boolean;
  /** The chosen error status (only meaningful when `triggered`). */
  status: number;
}

/**
 * Resolve a {@link Delay} spec to a concrete ms value. A fixed number is
 * returned as-is (clamped to `>= 0`); a `[min, max]` range yields a value in
 * that inclusive range using `rng`. `undefined` → `0`.
 */
export function resolveDelay(delay: Delay | undefined, rng: () => number): number {
  if (delay === undefined) return 0;
  if (Array.isArray(delay)) {
    const [min, max] = delay;
    if (max <= min) return Math.max(0, min);
    return Math.floor(rng() * (max - min + 1)) + min;
  }
  return Math.max(0, delay);
}

/**
 * Decide whether a request should be failed, and with which status. Consumes
 * one `rng()` for the probability roll and — only when it fires and more than
 * one status is configured — a second `rng()` to pick the status. Deterministic
 * for a deterministic `rng`, which is what the tests rely on.
 */
export function rollChaos(rate: number, statuses: number[] | undefined, rng: () => number): ChaosDecision {
  const pool = statuses && statuses.length > 0 ? statuses : [500];
  if (!(rate > 0) || rng() >= rate) return { triggered: false, status: pool[0]! };
  const idx = pool.length === 1 ? 0 : Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return { triggered: true, status: pool[idx]! };
}
