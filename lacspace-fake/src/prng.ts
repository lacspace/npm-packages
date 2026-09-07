/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Deterministic: the same seed always yields the same sequence, which is what
 * makes fake-data fixtures reproducible across runs and machines. Every
 * generator in this package draws exclusively from an `RNG` instance so that a
 * fixed `--seed` produces byte-identical output.
 */

/** Hash an arbitrary string to a 32-bit unsigned integer (for string seeds). */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Coerce a user-supplied seed (number, numeric string, or arbitrary string). */
export function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") return Math.floor(seed) >>> 0;
  const trimmed = seed.trim();
  if (/^-?\d+$/.test(trimmed)) return Math.abs(Number(trimmed)) >>> 0;
  return hashSeed(trimmed);
}

/** The mulberry32 core: a fast, well-distributed 32-bit PRNG. */
function mulberry32(a: number): () => number {
  let state = a >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random source with typed convenience helpers. */
export class RNG {
  private readonly _next: () => number;
  readonly seed: number;

  constructor(seed: number | string) {
    this.seed = normalizeSeed(seed);
    this._next = mulberry32(this.seed);
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this._next();
  }

  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max) rounded to `decimals` places (default 2). */
  float(min: number, max: number, decimals = 2): number {
    if (max < min) [min, max] = [max, min];
    const v = min + this.next() * (max - min);
    const f = 10 ** decimals;
    return Math.round(v * f) / f;
  }

  /** `true` with probability `prob` (default 0.5). */
  bool(prob = 0.5): boolean {
    return this.next() < prob;
  }

  /** Pick one element uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick() called on an empty array");
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Pick `n` distinct elements (Fisher–Yates partial shuffle). */
  sample<T>(items: readonly T[], n: number): T[] {
    const arr = items.slice();
    const k = Math.min(n, arr.length);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(this.next() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr.slice(0, k);
  }

  /** Return a shuffled copy. */
  shuffle<T>(items: readonly T[]): T[] {
    return this.sample(items, items.length);
  }

  /** Weighted pick. Entries are `[value, weight]`; weights need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + (w > 0 ? w : 0), 0);
    if (total <= 0) throw new Error("weighted() needs at least one positive weight");
    let r = this.next() * total;
    for (const [value, w] of entries) {
      if (w <= 0) continue;
      r -= w;
      if (r < 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  /** A string of `len` random hex characters. */
  hex(len: number): string {
    let out = "";
    for (let i = 0; i < len; i++) out += "0123456789abcdef"[this.int(0, 15)];
    return out;
  }

  /** A string of `len` random decimal digits. */
  digits(len: number): string {
    let out = "";
    for (let i = 0; i < len; i++) out += String(this.int(0, 9));
    return out;
  }

  /** Pick `len` characters from an alphabet. */
  chars(alphabet: string, len: number): string {
    let out = "";
    for (let i = 0; i < len; i++) out += alphabet[this.int(0, alphabet.length - 1)];
    return out;
  }

  /** An RFC-4122 version-4 UUID, drawn deterministically from this RNG. */
  uuid(): string {
    const h = this.hex(32).split("");
    // version 4
    h[12] = "4";
    // variant 10xx
    h[16] = "89ab"[this.int(0, 3)]!;
    const s = h.join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
  }
}
