/**
 * Scoring + grading. Pure. A finding scores 1 (ok), 0.5 (warn) or 0 (fail);
 * `info` findings are excluded. A category score is the weighted average of its
 * gradeable findings (0–100). The overall score is the weighted average of the
 * graded categories. Letter grades come from {@link gradeOf}.
 */
import type { Category, Finding, Grade } from "./types.js";

const POINTS: Record<string, number> = { ok: 1, warn: 0.5, fail: 0 };

/** Map a 0–100 score to a letter grade. Pure. */
export function gradeOf(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Score a list of findings 0–100 by weighted ok/warn/fail. Returns `null` when
 * there is nothing gradeable (only `info` findings, or an empty list). Pure.
 */
export function scoreFindings(findings: Finding[]): number | null {
  let total = 0;
  let earned = 0;
  for (const f of findings) {
    if (f.status === "info") continue;
    const w = f.weight ?? 1;
    total += w;
    earned += (POINTS[f.status] ?? 0) * w;
  }
  if (total === 0) return null;
  return Math.round((earned / total) * 100);
}

/** Build a {@link Category} from its findings, scoring + grading it. Pure. */
export function makeCategory(
  key: Category["key"],
  title: string,
  weight: number,
  findings: Finding[],
): Category {
  const score = scoreFindings(findings);
  return { key, title, weight, findings, score, grade: score === null ? null : gradeOf(score) };
}

/**
 * Roll a set of categories up to an overall 0–100 score, weighting each by its
 * `weight` and skipping un-graded (score === null) categories. Pure.
 */
export function overallScore(categories: Category[]): number {
  let total = 0;
  let earned = 0;
  for (const c of categories) {
    if (c.score === null) continue;
    total += c.weight;
    earned += c.score * c.weight;
  }
  if (total === 0) return 100;
  return Math.round(earned / total);
}
