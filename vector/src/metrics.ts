import type { DistanceMetric } from "./types";

/**
 * Dot product of two equal-length vectors: `Σ aᵢ·bᵢ`.
 * Higher = more aligned. Throws if the lengths differ.
 */
export function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] as number) * (b[i] as number);
  }
  return sum;
}

/**
 * Cosine similarity: the dot product divided by the product of the L2 norms, i.e.
 * the cosine of the angle between the vectors. Ranges roughly in `[-1, 1]`;
 * higher = more similar. A zero-magnitude vector yields `0`. Throws on a length
 * mismatch. This is the right default for most text embeddings.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dp = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dp += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dp / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Euclidean (L2) **distance**: `√Σ (aᵢ-bᵢ)²`. Lower = closer. Throws on a length
 * mismatch. Note this is a *distance*, not a similarity — for best-first ranking
 * a store converts it with {@link euclideanSimilarity}.
 */
export function euclidean(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Euclidean distance mapped to a bounded similarity, `1 / (1 + distance)`, so
 * that identical vectors score `1`, farther ones tend toward `0`, and best-first
 * ordering by score matches nearest-first ordering by distance.
 */
export function euclideanSimilarity(a: number[], b: number[]): number {
  return 1 / (1 + euclidean(a, b));
}

/**
 * Resolve a {@link DistanceMetric} to the similarity function used for ranking
 * (higher = better for every metric).
 */
export function similarityFor(
  metric: DistanceMetric,
): (a: number[], b: number[]) => number {
  switch (metric) {
    case "dot":
      return dot;
    case "euclidean":
      return euclideanSimilarity;
    case "cosine":
    default:
      return cosine;
  }
}
