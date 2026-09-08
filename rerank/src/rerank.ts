import type { Doc, Scored, RerankOptions } from "./types";
import { bm25, tfidfRerank, sortByScore } from "./lexical";
import { hybridRerank } from "./fusion";
import { mmr } from "./mmr";

/**
 * The one-call reranker: score `docs` for `query`, optionally diversify, and
 * return the top-`k` as {@link Scored}s (sorted, most relevant first).
 *
 * Scoring, in order of precedence:
 * 1. `opts.score` — an injected cross-encoder / LLM reranker
 *    (`(query, docs) => number[] | Promise<number[]>`). When present it wins.
 * 2. `opts.method` — `"bm25"` (default), `"tfidf"`, or `"hybrid"` (blends the
 *    upstream vector `doc.score` with a lexical score).
 *
 * With `opts.diversity.mmr`, an MMR pass re-orders the scored candidates to
 * reduce redundancy before the top-`k` cut.
 *
 * Async only because an injected `score` may be async; the built-in methods
 * are pure and synchronous.
 */
export async function rerank(
  query: string,
  docs: Doc[],
  opts: RerankOptions = {},
): Promise<Scored[]> {
  const {
    method = "bm25",
    k,
    score,
    diversity,
    tokenize,
    vectorWeight,
    lexicalWeight,
  } = opts;

  let scored: Scored[];

  if (score) {
    const scores = await score(query, docs);
    scored = sortByScore(
      docs.map((doc, i) => ({ ...doc, rerankScore: scores[i] ?? 0 })),
    );
  } else if (method === "hybrid") {
    scored = hybridRerank(query, docs, {
      vectorWeight,
      lexicalWeight,
      tokenize,
    });
  } else if (method === "tfidf") {
    scored = tfidfRerank(query, docs, { tokenize });
  } else {
    scored = bm25(query, docs, { tokenize });
  }

  const limit = k ?? scored.length;

  if (diversity?.mmr) {
    // MMR reads the `rerankScore` we just attached as its relevance signal.
    return mmr(scored, {
      lambda: diversity.lambda,
      k: limit,
      similarity: diversity.similarity,
      tokenize,
    }) as Scored[];
  }

  return scored.slice(0, limit);
}
