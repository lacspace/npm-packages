import type { Rng } from "./types";

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Deterministic for a
 * given seed. This is intentionally NOT cryptographically secure; it exists so
 * that fixtures are reproducible across runs and machines.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Combine several integers into a single 32-bit seed (FNV-1a style). Used to
 * derive an independent, reproducible stream per (baseSeed, factory, sequence).
 */
export function hashSeed(...nums: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable 32-bit hash of a string (FNV-1a) — used to salt a factory's stream. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HEX = "0123456789abcdef";

/** Wrap a raw `() => number` stream into the public {@link Rng} helper surface. */
export function makeRng(next: () => number): Rng {
  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    float(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + next() * (max - min);
    },
    bool(p = 0.5) {
      return next() < p;
    },
    pick(arr) {
      if (arr.length === 0) throw new Error("pick(): cannot pick from an empty array");
      return arr[Math.floor(next() * arr.length)]!;
    },
    sample(arr, n) {
      const copy = arr.slice();
      // Fisher–Yates using the seeded stream.
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i]!;
        copy[i] = copy[j]!;
        copy[j] = tmp;
      }
      const take = Math.max(0, Math.min(n, copy.length));
      return copy.slice(0, take);
    },
    uuid() {
      let s = "";
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
          s += "-";
        } else if (i === 14) {
          s += "4"; // version
        } else if (i === 19) {
          s += HEX[(Math.floor(next() * 16) & 0x3) | 0x8]!; // variant
        } else {
          s += HEX[Math.floor(next() * 16)]!;
        }
      }
      return s;
    },
  };
  return rng;
}
