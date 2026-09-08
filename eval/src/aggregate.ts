/**
 * Running many scorers against one output, and combinators that fold several
 * scorers into a single {@link Scorer}.
 */
import type { EvalResult, Score, Scorer } from "./types";
import { clamp01 } from "./internal";

/**
 * Apply every scorer to `output` and aggregate the results.
 *
 * Scorers may be sync or async (e.g. an embedding- or judge-backed one), so
 * this is async. `score` is the mean of the individual scores; `passed` is
 * `true` only when every scorer passed.
 */
export async function scoreAll(output: string, scorers: Scorer[]): Promise<EvalResult> {
  const scores: Score[] = await Promise.all(scorers.map((s) => s(output)));
  const score = scores.length === 0 ? 1 : clamp01(scores.reduce((a, s) => a + s.score, 0) / scores.length);
  const passed = scores.every((s) => s.passed);
  return { output, scores, score, passed };
}

/** A scorer paired with a relative weight, for {@link weighted}. */
export interface WeightedScorer {
  /** The scorer to run. */
  scorer: Scorer;
  /** Relative weight (default `1`). */
  weight?: number;
}

/**
 * Combine scorers into one whose score is the **weighted mean** of its parts.
 * Accepts either bare scorers (equal weight) or `{ scorer, weight }` entries.
 * The combined score `passed` when every part passed.
 */
export function weighted(scorers: Array<Scorer | WeightedScorer>, opts: { name?: string } = {}): Scorer {
  const entries = scorers.map((s) => (typeof s === "function" ? { scorer: s, weight: 1 } : s));
  return async (output: string): Promise<Score> => {
    const parts = await Promise.all(entries.map((e) => e.scorer(output)));
    let totalW = 0;
    let acc = 0;
    parts.forEach((p, i) => {
      const w = entries[i]!.weight ?? 1;
      totalW += w;
      acc += w * p.score;
    });
    const score = totalW === 0 ? 1 : clamp01(acc / totalW);
    return {
      name: opts.name ?? "weighted",
      score,
      passed: parts.every((p) => p.passed),
      details: { parts },
    };
  };
}

/**
 * Logical AND: `passed` only when every sub-scorer passed; `score` is the
 * minimum of the sub-scores (the weakest link).
 */
export function allOf(scorers: Scorer[], opts: { name?: string } = {}): Scorer {
  return async (output: string): Promise<Score> => {
    const parts = await Promise.all(scorers.map((s) => s(output)));
    const score = parts.length === 0 ? 1 : Math.min(...parts.map((p) => p.score));
    return {
      name: opts.name ?? "allOf",
      score: clamp01(score),
      passed: parts.every((p) => p.passed),
      details: { parts },
    };
  };
}

/**
 * Logical OR: `passed` when any sub-scorer passed; `score` is the maximum of
 * the sub-scores (the strongest match).
 */
export function anyOf(scorers: Scorer[], opts: { name?: string } = {}): Scorer {
  return async (output: string): Promise<Score> => {
    const parts = await Promise.all(scorers.map((s) => s(output)));
    const score = parts.length === 0 ? 0 : Math.max(...parts.map((p) => p.score));
    return {
      name: opts.name ?? "anyOf",
      score: clamp01(score),
      passed: parts.some((p) => p.passed),
      details: { parts },
    };
  };
}
