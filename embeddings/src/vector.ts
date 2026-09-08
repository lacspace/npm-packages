import type { SimilarityHit, Vector } from "./types";

/** Thrown when vector operands are incompatible (e.g. mismatched lengths). */
export class VectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorError";
  }
}

function assertSameLength(a: Vector, b: Vector): void {
  if (a.length !== b.length) {
    throw new VectorError(
      `Vectors must have the same length (got ${a.length} and ${b.length}).`,
    );
  }
}

/** Dot product `a · b`. Throws if the vectors differ in length. */
export function dotProduct(a: Vector, b: Vector): number {
  assertSameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

/** Euclidean (L2) length `‖v‖` of a vector. */
export function magnitude(v: Vector): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += (v[i] as number) * (v[i] as number);
  return Math.sqrt(sum);
}

/**
 * Cosine similarity in `[-1, 1]`. Returns `0` when either vector has zero
 * magnitude (undefined direction) rather than `NaN`.
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  assertSameLength(a, b);
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return 0;
  return dotProduct(a, b) / (ma * mb);
}

/** Euclidean (L2) distance between two vectors. Throws on length mismatch. */
export function euclideanDistance(a: Vector, b: Vector): number {
  assertSameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Return a unit-length copy of `v` (L2 normalized). A zero vector is returned
 * unchanged (as a fresh copy) since it has no direction.
 */
export function normalize(v: Vector): Vector {
  const m = magnitude(v);
  if (m === 0) return v.slice();
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i] as number) / m;
  return out;
}

/**
 * Element-wise mean of several equal-length vectors — a simple way to pool many
 * embeddings (e.g. sentence → document). Throws on an empty list or ragged
 * dimensions.
 */
export function meanPool(vectors: Vector[]): Vector {
  if (vectors.length === 0) {
    throw new VectorError("meanPool requires at least one vector.");
  }
  const dim = (vectors[0] as Vector).length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) {
      throw new VectorError(
        `meanPool requires equal-length vectors (expected ${dim}, got ${v.length}).`,
      );
    }
    for (let i = 0; i < dim; i++) out[i] = (out[i] as number) + (v[i] as number);
  }
  for (let i = 0; i < dim; i++) out[i] = (out[i] as number) / vectors.length;
  return out;
}

/**
 * Rank `candidates` by cosine similarity to `query` and return the top `k` as
 * `{ index, score }`, highest score first. `index` refers to the candidate's
 * position in the input array. `k` is clamped to `[0, candidates.length]`.
 */
export function topKSimilar(
  query: Vector,
  candidates: Vector[],
  k: number,
): SimilarityHit[] {
  const hits: SimilarityHit[] = candidates.map((c, index) => ({
    index,
    score: cosineSimilarity(query, c),
  }));
  hits.sort((x, y) => y.score - x.score);
  const n = Math.max(0, Math.min(Math.floor(k), hits.length));
  return hits.slice(0, n);
}
