import type { Doc, Scored, RrfOptions, HybridOptions } from "./types";
import { bm25, tfidfRerank, sortByScore } from "./lexical";

/**
 * Fuse several ranked lists into one with **Reciprocal Rank Fusion**.
 *
 * Ideal for combining heterogeneous rankers whose scores are not comparable —
 * e.g. a vector list from `@lacspace/vector` and a {@link bm25} list. A doc at
 * (0-based) rank `r` in list `j` contributes `weights[j] / (k + r + 1)`;
 * contributions sum across the lists it appears in.
 *
 * Returns the union of all docs, de-duplicated by `id` (first occurrence's
 * fields win), each with its fused RRF value written to `score`, sorted
 * descending.
 *
 * @param opts.k dampening constant, default `60`
 */
export function reciprocalRankFusion(
  rankings: Doc[][],
  opts: RrfOptions = {},
): Doc[] {
  const { k = 60, weights } = opts;
  const fused = new Map<string, number>();
  const first = new Map<string, Doc>();

  rankings.forEach((list, j) => {
    const w = weights?.[j] ?? 1;
    list.forEach((doc, rank) => {
      if (!first.has(doc.id)) first.set(doc.id, doc);
      fused.set(doc.id, (fused.get(doc.id) ?? 0) + w / (k + rank + 1));
    });
  });

  return [...first.entries()]
    .map(([id, doc], i) => ({ doc: { ...doc, score: fused.get(id)! }, i }))
    .sort((a, b) => b.doc.score - a.doc.score || a.i - b.i)
    .map(({ doc }) => doc);
}

/** Min-max normalize a list of numbers into `[0, 1]` (all-equal → all `0`). */
function minMax(values: number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (!isFinite(span) || span === 0) return values.map(() => 0);
  return values.map((v) => (v - min) / span);
}

/**
 * Blend an existing **vector** score (`doc.score`) with a **lexical** score
 * into a single reranking.
 *
 * Both signals are min-max normalized across `docs` (so their scales don't
 * matter) and combined as
 * `vectorWeight · vecNorm + lexicalWeight · lexNorm`. Returns {@link Scored}s
 * sorted descending.
 *
 * @param opts.vectorWeight  default `0.5`
 * @param opts.lexicalWeight default `0.5`
 * @param opts.method lexical scorer, `"bm25"` (default) or `"tfidf"`
 */
export function hybridRerank(
  query: string,
  docs: Doc[],
  opts: HybridOptions = {},
): Scored[] {
  const {
    vectorWeight = 0.5,
    lexicalWeight = 0.5,
    method = "bm25",
    tokenize,
  } = opts;

  const lexScored =
    method === "tfidf"
      ? tfidfRerank(query, docs, { tokenize })
      : bm25(query, docs, { tokenize });

  // Map lexical scores back onto the original doc order.
  const lexById = new Map(lexScored.map((d) => [d.id, d.rerankScore]));

  const vecNorm = minMax(docs.map((d) => d.score ?? 0));
  const lexNorm = minMax(docs.map((d) => lexById.get(d.id) ?? 0));

  const scored: Scored[] = docs.map((doc, i) => ({
    ...doc,
    rerankScore: vectorWeight * vecNorm[i]! + lexicalWeight * lexNorm[i]!,
  }));

  return sortByScore(scored);
}
