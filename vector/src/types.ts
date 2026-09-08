/**
 * The distance / similarity metric used to compare vectors.
 *
 * - `"cosine"` — cosine similarity (angle between vectors), the default and the
 *   right choice for most text embeddings. Higher = more similar.
 * - `"dot"` — raw dot product. Good when your embeddings are pre-normalised or
 *   when magnitude carries meaning. Higher = more similar.
 * - `"euclidean"` — L2 (straight-line) distance, exposed as a similarity so that
 *   best-first ordering still holds (see {@link QueryResult.score}).
 */
export type DistanceMetric = "cosine" | "dot" | "euclidean";

/**
 * A single stored item: an id, its embedding vector and optional payload.
 *
 * This shape is the **storage contract** the wider Lacspace RAG stack agrees on
 * (`@lacspace/embeddings` produces the `vector`, `@lacspace/rag` reads back the
 * `text` + `metadata`), so keep it stable.
 */
export interface VectorRecord {
  /** Stable, unique identifier. Re-using an id in `upsert` overwrites the record. */
  id: string;
  /** The embedding. Every record in a store must share the same length. */
  vector: number[];
  /** Arbitrary structured payload (source, tags, timestamps, …). Optional. */
  metadata?: Record<string, unknown>;
  /** The original text the vector was embedded from. Optional. */
  text?: string;
}

/**
 * A single hit returned by {@link VectorStore.query} / {@link VectorStore.queryById}.
 * Results are always sorted **best-first** (highest `score` first).
 */
export interface QueryResult {
  /** The matched record's id. */
  id: string;
  /**
   * Similarity score — **higher is always better**, regardless of metric. For
   * `"euclidean"` this is `1 / (1 + distance)`, so nearer points score higher
   * and the same best-first ordering holds across every metric.
   */
  score: number;
  /** The matched record's metadata, if any. */
  metadata?: Record<string, unknown>;
  /** The matched record's text, if any. */
  text?: string;
  /** The matched record's vector, included only when `opts.includeVectors` is set. */
  vector?: number[];
}

/** Options for {@link createVectorStore}. */
export interface VectorStoreOptions {
  /** Similarity metric to compare vectors with. Default `"cosine"`. */
  metric?: DistanceMetric;
  /**
   * Expected vector length. When set, `upsert` throws on any mismatched vector
   * and `query` throws on a mismatched query vector. When omitted, the length of
   * the first upserted vector is adopted automatically.
   */
  dimensions?: number;
}

/** Options for {@link VectorStore.query} and {@link VectorStore.queryById}. */
export interface QueryOptions {
  /** Maximum number of results to return. Default `10`. */
  k?: number;
  /** Keep only records for which this predicate returns `true` (pre-scoring). */
  filter?: (rec: VectorRecord) => boolean;
  /** Drop any hit whose score is below this threshold. */
  minScore?: number;
  /** Include the raw `vector` on each returned hit. Default `false`. */
  includeVectors?: boolean;
}

/** Options for {@link VectorStore.queryById}. */
export interface QueryByIdOptions extends QueryOptions {
  /** Include the query record itself in the results. Default `false` (excluded). */
  includeSelf?: boolean;
}

/**
 * The plain-JSON snapshot produced by {@link VectorStore.toJSON} and consumed by
 * {@link VectorStore.load} / {@link fromJSON}. Safe to `JSON.stringify` and persist.
 */
export interface SerializedStore {
  /** Schema/format version. */
  version: 1;
  metric: DistanceMetric;
  dimensions: number | null;
  records: VectorRecord[];
}

/** An in-memory, brute-force vector store. Create one with {@link createVectorStore}. */
export interface VectorStore {
  /** The similarity metric this store compares vectors with. */
  readonly metric: DistanceMetric;
  /** The fixed vector length, or `null` until the first record fixes it. */
  readonly dimensions: number | null;
  /** Number of records currently stored. */
  readonly size: number;

  /** Insert or overwrite one or many records (matched by `id`). */
  upsert(records: VectorRecord | VectorRecord[]): void;
  /** Fetch a record by id, or `undefined` if absent. */
  get(id: string): VectorRecord | undefined;
  /** Remove a record. Returns `true` if it existed. */
  delete(id: string): boolean;
  /** Whether a record with this id exists. */
  has(id: string): boolean;
  /** Remove every record (dimensions/metric are preserved). */
  clear(): void;
  /** A shallow-cloned array of every stored record. */
  all(): VectorRecord[];

  /** k-nearest-neighbour search against a query vector, best-first. */
  query(vector: number[], opts?: QueryOptions): QueryResult[];
  /** k-nearest-neighbour search against an existing record's vector, best-first. */
  queryById(id: string, opts?: QueryByIdOptions): QueryResult[];

  /** Serialise the whole store to a plain JSON object. */
  toJSON(): SerializedStore;
  /** Replace all contents from a snapshot produced by {@link toJSON}. Chainable. */
  load(data: SerializedStore): VectorStore;
}
