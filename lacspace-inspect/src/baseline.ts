/**
 * Baseline / regression diffing. {@link diffReports} compares a previously-saved
 * {@link Report} (the baseline) with the current run and returns the
 * {@link Regression}s — things that got *worse*: a dropped overall grade, a
 * lower category score, or a finding whose status regressed (ok → warn/fail,
 * warn → fail, or a brand-new failing finding). Pure — perfect for a CI gate.
 */
import type { Finding, Grade, Regression, Report } from "./types.js";

const GRADE_RANK: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const STATUS_RANK: Record<Finding["status"], number> = { ok: 3, info: 2, warn: 1, fail: 0 };

/** Index a report's findings by id (last one wins if duplicated). */
function findingMap(report: Report): Map<string, Finding> {
  const m = new Map<string, Finding>();
  for (const c of report.categories) for (const f of c.findings) m.set(f.id, f);
  return m;
}
function categoryScores(report: Report): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of report.categories) if (c.score !== null) m.set(c.key, c.score);
  return m;
}

/**
 * Diff a baseline report against the current one. Returns every regression,
 * worst-first-ish (overall, then categories, then findings). Pure.
 *
 * @param scoreTolerance category-score drops smaller than this are ignored
 *        (default 0) — useful to avoid noise from ±1 rounding.
 */
export function diffReports(baseline: Report, current: Report, scoreTolerance = 0): Regression[] {
  const out: Regression[] = [];

  // Overall grade / score.
  if (GRADE_RANK[current.grade] < GRADE_RANK[baseline.grade]) {
    out.push({ kind: "overall", id: "overall.grade", message: `Overall grade dropped ${baseline.grade} → ${current.grade}`, before: baseline.grade, after: current.grade });
  } else if (baseline.score - current.score > scoreTolerance) {
    out.push({ kind: "overall", id: "overall.score", message: `Overall score dropped ${baseline.score} → ${current.score}`, before: baseline.score, after: current.score });
  }

  // Per-category scores.
  const curCat = categoryScores(current);
  for (const [key, before] of categoryScores(baseline)) {
    const after = curCat.get(key);
    if (after === undefined) continue; // category no longer graded — not a regression on its own
    if (before - after > scoreTolerance) {
      out.push({ kind: "category", id: key, message: `Category "${key}" score dropped ${before} → ${after}`, before, after });
    }
  }

  // Per-finding status regressions.
  const curF = findingMap(current);
  for (const [id, bf] of findingMap(baseline)) {
    const cf = curF.get(id);
    if (!cf) continue; // finding vanished — can't call it a regression
    if (STATUS_RANK[cf.status] < STATUS_RANK[bf.status]) {
      out.push({ kind: "finding", id, message: `${id}: ${bf.status} → ${cf.status} — ${cf.message}`, before: bf.status, after: cf.status });
    }
  }

  return out;
}
