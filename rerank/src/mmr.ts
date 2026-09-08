import type { Doc, Scored, Similarity, MmrOptions } from "./types";
import { defaultTokenize } from "./tokenize";

/** Cosine similarity of two equal-length numeric vectors, clamped to `[0, 1]`-ish. */
export function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** Jaccard similarity of two token sets. */
export function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/** Relevance signal for MMR: prefer a computed `rerankScore`, else `score`, else `0`. */
function relevanceOf(doc: Doc): number {
  const rs = (doc as Scored).rerankScore;
  return typeof rs === "number" ? rs : (doc.score ?? 0);
}

function minMax(values: number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (!isFinite(span) || span === 0) return values.map(() => (values.length ? 1 : 0));
  return values.map((v) => (v - min) / span);
}

/**
 * Re-order `docs` with **Maximal Marginal Relevance** to cut redundancy.
 *
 * Greedily selects the next doc that maximizes
 * `lambda · relevance − (1 − lambda) · maxSimToSelected`. Relevance comes from
 * `rerankScore` (if present) or `score`, min-max normalized across the input.
 *
 * Similarity defaults to cosine over `doc.vector` when both docs carry a
 * vector, otherwise token Jaccard over the doc text — or inject your own via
 * `opts.similarity`.
 *
 * Returns the selected docs (up to `k`) in selection order, preserving each
 * doc's existing fields.
 *
 * @param opts.lambda relevance↔diversity trade-off in `[0, 1]`, default `0.5`
 * @param opts.k number to select, default = all
 */
export function mmr(docs: Doc[], opts: MmrOptions = {}): Doc[] {
  const { lambda = 0.5, tokenize = defaultTokenize } = opts;
  const k = Math.min(opts.k ?? docs.length, docs.length);
  if (k <= 0 || docs.length === 0) return [];

  // Precompute token sets for the lexical fallback.
  const tokenSets = docs.map((d) => new Set(tokenize(d.text)));

  const sim: Similarity =
    opts.similarity ??
    ((a, b) => {
      if (a.vector && b.vector && a.vector.length && b.vector.length) {
        return cosineSim(a.vector, b.vector);
      }
      const ia = docs.indexOf(a);
      const ib = docs.indexOf(b);
      return jaccardSim(
        ia >= 0 ? tokenSets[ia]! : new Set(tokenize(a.text)),
        ib >= 0 ? tokenSets[ib]! : new Set(tokenize(b.text)),
      );
    });

  const rel = minMax(docs.map(relevanceOf));
  const remaining = docs.map((_, i) => i);
  const selected: number[] = [];

  while (selected.length < k && remaining.length > 0) {
    let bestPos = 0;
    let bestVal = -Infinity;
    for (let p = 0; p < remaining.length; p++) {
      const idx = remaining[p]!;
      let maxSim = 0;
      for (const s of selected) {
        const sv = sim(docs[idx]!, docs[s]!);
        if (sv > maxSim) maxSim = sv;
      }
      const mmrVal = lambda * rel[idx]! - (1 - lambda) * maxSim;
      if (mmrVal > bestVal) {
        bestVal = mmrVal;
        bestPos = p;
      }
    }
    selected.push(remaining[bestPos]!);
    remaining.splice(bestPos, 1);
  }

  return selected.map((i) => docs[i]!);
}
