/**
 * Public types for `@lacspace/rerank`.
 *
 * This package **reranks** an already-retrieved list of documents to improve
 * RAG precision. It composes with the Lacspace siblings — it consumes the
 * chunks produced by `@lacspace/rag` (which retrieves them from
 * `@lacspace/vector`) — but has **zero runtime dependencies**: every
 * collaborator (a cross-encoder / LLM scorer, a custom similarity, a
 * tokenizer) is accepted as a duck-typed, injectable function, so it works
 * standalone and is fully testable with in-memory fakes.
 */

/**
 * A retrieved document to rerank.
 *
 * This mirrors the retrieved-chunk shape emitted by `@lacspace/rag`
 * (`{ id, text, score?, metadata? }`) with an optional `vector` so
 * vector-aware reranking (hybrid blend, cosine MMR) works without a second
 * lookup. Anything with at least `{ id, text }` is a valid `Doc`.
 */
export interface Doc {
  /** Stable identifier of the document / chunk. */
  id: string;
  /** The document text — what lexical scorers read. */
  text: string;
  /**
   * The upstream relevance score (e.g. the vector-store similarity from
   * `@lacspace/vector`). Higher is more relevant. Used by {@link hybridRerank}
   * and as the default relevance signal for {@link mmr}.
   */
  score?: number;
  /** Arbitrary metadata carried through untouched. */
  metadata?: Record<string, unknown>;
  /** The embedding, if available — enables cosine similarity in {@link mmr}. */
  vector?: number[];
}

/** A {@link Doc} with the reranker's computed score attached. */
export type Scored = Doc & {
  /** The reranker's score for this document — higher is more relevant. */
  rerankScore: number;
};

/**
 * Splits text into comparable terms. The default lowercases and splits on
 * non-alphanumeric boundaries. Inject your own (stemming, n-grams, CJK
 * segmentation, …) to change how every lexical scorer tokenizes.
 */
export type Tokenizer = (text: string) => string[];

/**
 * An injectable relevance scorer — the seam for a **cross-encoder** or an
 * **LLM reranker**. Given the query and the candidate docs, returns one score
 * per doc, in order (higher is more relevant). May be sync or async.
 *
 * Keep it injectable so tests never hit a network and any provider plugs in.
 */
export type RerankScorer = (
  query: string,
  docs: Doc[],
) => Promise<number[]> | number[];

/**
 * A pairwise document similarity in roughly `[0, 1]` (higher = more alike),
 * used by {@link mmr} to penalize redundancy.
 */
export type Similarity = (a: Doc, b: Doc) => number;

/** Options for {@link bm25}. */
export interface Bm25Options {
  /** Term-frequency saturation. Default `1.5` (classic Okapi). */
  k1?: number;
  /** Length-normalization strength in `[0, 1]`. Default `0.75`. */
  b?: number;
  /** Custom tokenizer. Default = lowercase alphanumeric split. */
  tokenize?: Tokenizer;
}

/** Options for {@link tfidfRerank}. */
export interface TfidfOptions {
  /** Custom tokenizer. Default = lowercase alphanumeric split. */
  tokenize?: Tokenizer;
}

/** Options for {@link keywordOverlapScore}. */
export interface KeywordOverlapOptions {
  /** Custom tokenizer. Default = lowercase alphanumeric split. */
  tokenize?: Tokenizer;
  /**
   * `"jaccard"` = |∩| / |∪| (symmetric). `"overlap"` = fraction of the
   * query's distinct terms present in the doc. Default `"jaccard"`.
   */
  mode?: "jaccard" | "overlap";
}

/** Options for {@link reciprocalRankFusion}. */
export interface RrfOptions {
  /** RRF dampening constant — larger flattens the rank contribution. Default `60`. */
  k?: number;
  /** Per-list weights (aligned with the `rankings` array). Default all `1`. */
  weights?: number[];
}

/** Options for {@link hybridRerank}. */
export interface HybridOptions {
  /** Weight of the upstream vector `doc.score`. Default `0.5`. */
  vectorWeight?: number;
  /** Weight of the lexical score. Default `0.5`. */
  lexicalWeight?: number;
  /** Lexical method used for the blend. Default `"bm25"`. */
  method?: "bm25" | "tfidf";
  /** Custom tokenizer for the lexical pass. */
  tokenize?: Tokenizer;
}

/** Options for {@link mmr}. */
export interface MmrOptions {
  /**
   * Trade-off in `[0, 1]` between relevance (`1`) and diversity (`0`).
   * Default `0.5`.
   */
  lambda?: number;
  /** How many documents to select. Default = all. */
  k?: number;
  /**
   * Pairwise similarity. Default: cosine over `doc.vector` when both docs
   * have vectors, otherwise token Jaccard over the doc text.
   */
  similarity?: Similarity;
  /** Custom tokenizer for the fallback lexical similarity. */
  tokenize?: Tokenizer;
}

/** Diversity pass configuration for {@link rerank}. */
export interface RerankDiversity {
  /** Enable an MMR diversity pass over the scored candidates. Default `false`. */
  mmr?: boolean;
  /** MMR relevance/diversity trade-off. Default `0.5`. */
  lambda?: number;
  /** Custom similarity for the MMR pass. */
  similarity?: Similarity;
}

/** Options for the main {@link rerank} entry point. */
export interface RerankOptions {
  /** Lexical method when no injected {@link RerankOptions.score} is given. Default `"bm25"`. */
  method?: "bm25" | "tfidf" | "hybrid";
  /** Return only the top `k` after reranking. Default = all. */
  k?: number;
  /**
   * An injectable scorer (cross-encoder / LLM reranker). When provided it
   * overrides `method` — its scores become the `rerankScore`s.
   */
  score?: RerankScorer;
  /** Optional MMR diversity pass applied after scoring. */
  diversity?: RerankDiversity;
  /** Custom tokenizer forwarded to the lexical scorer. */
  tokenize?: Tokenizer;
  /** Weights forwarded to the `"hybrid"` method. */
  vectorWeight?: number;
  /** Weights forwarded to the `"hybrid"` method. */
  lexicalWeight?: number;
}
