import type {
  Doc,
  Scored,
  Bm25Options,
  TfidfOptions,
  KeywordOverlapOptions,
} from "./types";
import { defaultTokenize, termFreqs } from "./tokenize";

/** Sort a copy of `scored` by `rerankScore` descending (stable on ties by input order). */
function sortByScore(scored: Scored[]): Scored[] {
  return scored
    .map((d, i) => ({ d, i }))
    .sort((a, b) => b.d.rerankScore - a.d.rerankScore || a.i - b.i)
    .map(({ d }) => d);
}

/** Distinct document frequency of each term across a tokenized corpus. */
function documentFreqs(docTokens: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  return df;
}

/**
 * Rerank `docs` for `query` with **classic Okapi BM25**.
 *
 * The corpus statistics (idf, average length) are computed from `docs`
 * themselves — this is a reranker over a retrieved set, not a global index.
 * Returns every input doc as a {@link Scored}, sorted by `rerankScore`
 * descending.
 *
 * @param opts.k1 term-frequency saturation, default `1.5`
 * @param opts.b  length normalization, default `0.75`
 */
export function bm25(
  query: string,
  docs: Doc[],
  opts: Bm25Options = {},
): Scored[] {
  const { k1 = 1.5, b = 0.75, tokenize = defaultTokenize } = opts;
  const n = docs.length;

  const docTokens = docs.map((d) => tokenize(d.text));
  const lengths = docTokens.map((t) => t.length);
  const totalLen = lengths.reduce((a, l) => a + l, 0);
  const avgdl = n > 0 ? totalLen / n : 0;
  const df = documentFreqs(docTokens);

  const queryTerms = new Set(tokenize(query));

  const scored: Scored[] = docs.map((doc, i) => {
    const tf = termFreqs(docTokens[i]!);
    const dl = lengths[i]!;
    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term);
      if (!f) continue;
      // idf with the +1 inside the log to keep it non-negative.
      const dfi = df.get(term) ?? 0;
      const idf = Math.log(1 + (n - dfi + 0.5) / (dfi + 0.5));
      const denom = f + k1 * (1 - b + (b * dl) / (avgdl || 1));
      score += idf * ((f * (k1 + 1)) / denom);
    }
    return { ...doc, rerankScore: score };
  });

  return sortByScore(scored);
}

/**
 * Rerank `docs` for `query` by **cosine similarity of TF-IDF vectors**.
 *
 * Uses smoothed idf `ln((N + 1) / (df + 1)) + 1` and L2-normalized vectors, so
 * scores lie in `[0, 1]`. Returns every input doc as a {@link Scored}, sorted
 * descending.
 */
export function tfidfRerank(
  query: string,
  docs: Doc[],
  opts: TfidfOptions = {},
): Scored[] {
  const { tokenize = defaultTokenize } = opts;
  const n = docs.length;

  const docTokens = docs.map((d) => tokenize(d.text));
  const df = documentFreqs(docTokens);
  const idf = (term: string) =>
    Math.log((n + 1) / ((df.get(term) ?? 0) + 1)) + 1;

  const queryTf = termFreqs(tokenize(query));
  const queryVec = new Map<string, number>();
  for (const [term, f] of queryTf) queryVec.set(term, f * idf(term));
  const queryNorm = norm(queryVec);

  const scored: Scored[] = docs.map((doc, i) => {
    const tf = termFreqs(docTokens[i]!);
    const vec = new Map<string, number>();
    for (const [term, f] of tf) vec.set(term, f * idf(term));
    const denom = queryNorm * norm(vec);
    let dotProd = 0;
    if (denom > 0) {
      for (const [term, w] of queryVec) {
        const dw = vec.get(term);
        if (dw) dotProd += w * dw;
      }
    }
    return { ...doc, rerankScore: denom > 0 ? dotProd / denom : 0 };
  });

  return sortByScore(scored);
}

function norm(vec: Map<string, number>): number {
  let s = 0;
  for (const w of vec.values()) s += w * w;
  return Math.sqrt(s);
}

/**
 * How much of the `query`'s vocabulary appears in `doc` — a fast, corpus-free
 * lexical signal in `[0, 1]`.
 *
 * @param opts.mode `"jaccard"` (default, symmetric |∩|/|∪|) or `"overlap"`
 *   (fraction of the query's distinct terms found in the doc).
 */
export function keywordOverlapScore(
  query: string,
  doc: Doc,
  opts: KeywordOverlapOptions = {},
): number {
  const { tokenize = defaultTokenize, mode = "jaccard" } = opts;
  const q = new Set(tokenize(query));
  const d = new Set(tokenize(doc.text));
  if (q.size === 0) return 0;

  let inter = 0;
  for (const t of q) if (d.has(t)) inter++;

  if (mode === "overlap") return inter / q.size;
  const union = q.size + d.size - inter;
  return union > 0 ? inter / union : 0;
}

export { sortByScore };
