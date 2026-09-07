/**
 * Pure, stateless experiment primitives — stable percentage rollouts and
 * weighted variant assignment keyed on `(flagKey, userId)`. No config object
 * required: pass a flag key and a user id and get a deterministic answer that
 * never changes for that pair, works offline, and needs no network round-trip.
 *
 * These share the same FNV-1a bucketing as the {@link Flags} store, so they are
 * unbiased across the hash space (a given percentage buckets ~that fraction of
 * users) and monotonic: as a rollout grows, users already inside stay inside.
 */

import { bucket } from "./index";

/* ------------------------------ percentage rollout ------------------------------ */

/**
 * Stable bucket in `[0, 100)` for a `(flagKey, userId)` pair. Two different
 * flags bucket the same user independently, so a user unlucky in one rollout is
 * not systematically unlucky in the next.
 */
export function rolloutBucket(flagKey: string, userId: string): number {
  return bucket(`${flagKey}:${userId}`) * 100;
}

/**
 * Is this user inside an `percentage`% rollout of `flagKey`? Deterministic and
 * **monotonic**: because the decision is `bucket < percentage`, a user included
 * at 10% is still included at 25%, 50%, 100% — so ramping a rollout never drops
 * anyone who already had the feature.
 *
 * @param percentage 0–100 (clamped at the ends; ≤0 → nobody, ≥100 → everybody).
 */
export function isInRollout(flagKey: string, userId: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  return rolloutBucket(flagKey, userId) < percentage;
}

/* ------------------------------ weighted variants ------------------------------ */

/** A variant with an optional relative weight (default 1 → equal split). */
export interface WeightedVariant {
  key: string;
  weight?: number;
}

/**
 * Stably assign a user to one of N weighted variants (A/B/C…) for `flagKey`.
 * The same `(flagKey, userId)` always returns the same variant, and the split
 * across many users tracks the configured weights. Variants with a weight ≤ 0
 * are excluded (a `control` with a `treatment` you can turn off). Returns `""`
 * only when there are no usable variants.
 */
export function assignVariant(flagKey: string, userId: string, variants: WeightedVariant[]): string {
  const pool = variants.filter((v) => (v.weight ?? 1) > 0);
  const list = pool.length ? pool : variants;
  const total = list.reduce((s, v) => s + (v.weight ?? 1), 0);
  if (total <= 0) return list[0]?.key ?? "";
  let point = bucket(`${flagKey}:${userId}:variant`) * total;
  for (const v of list) {
    point -= v.weight ?? 1;
    if (point < 0) return v.key;
  }
  return list[list.length - 1]?.key ?? "";
}

/**
 * Sum-check a variant list before you ship it. Returns `{ ok, total, error? }`.
 * Pass `expectedTotal` (e.g. `100` for percentage weights) to assert the weights
 * add up to exactly that; omit it to just verify there is some positive weight
 * and no duplicate/empty keys.
 */
export function validateVariants(
  variants: WeightedVariant[],
  expectedTotal?: number,
): { ok: boolean; total: number; error?: string } {
  if (!variants.length) return { ok: false, total: 0, error: "no variants" };
  const seen = new Set<string>();
  for (const v of variants) {
    if (!v.key) return { ok: false, total: 0, error: "variant with empty key" };
    if (seen.has(v.key)) return { ok: false, total: 0, error: `duplicate variant key "${v.key}"` };
    seen.add(v.key);
    if ((v.weight ?? 1) < 0) return { ok: false, total: 0, error: `negative weight on "${v.key}"` };
  }
  const total = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
  if (total <= 0) return { ok: false, total, error: "weights sum to zero" };
  if (expectedTotal != null && total !== expectedTotal) {
    return { ok: false, total, error: `weights sum to ${total}, expected ${expectedTotal}` };
  }
  return { ok: true, total };
}
