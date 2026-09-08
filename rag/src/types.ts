/**
 * Public types for `@lacspace/rag`.
 *
 * This package is the *glue* of a RAG pipeline: it composes an **embedder**, a
 * **vector store** and (optionally) a **splitter** to index documents and to
 * retrieve + assemble prompt context. Every collaborator is accepted as a
 * duck-typed, injectable interface, so the package has **zero runtime
 * dependencies**: it snaps together with the Lacspace siblings
 * (`@lacspace/embeddings`, `@lacspace/vector`, `@lacspace/chunk`) or with any
 * compatible implementation, and is fully testable with in-memory fakes.
 */

/** A value that may be returned synchronously or as a promise. */
export type Awaitable<T> = T | Promise<T>;

/** Arbitrary, JSON-ish metadata carried alongside a chunk. */
export type Metadata = Record<string, unknown>;

/**
 * A metadata filter passed through to the store's `query`. Interpreted by the
 * store itself; `@lacspace/vector` treats it as an equality match on metadata
 * fields. Left as `unknown` here so richer stores (ranges, `$in`, etc.) work
 * unchanged.
 */
export type MetadataFilter = Record<string, unknown>;

/**
 * The embedder contract — matches the `@lacspace/embeddings` `Embedder` shape.
 *
 * Takes a batch of texts and returns one vector per text, in order. Keep it
 * injectable so tests never hit a network and any provider can be plugged in.
 */
export type Embedder = (texts: string[]) => Promise<number[][]>;

/**
 * The optional splitter contract — matches the `@lacspace/chunk` shape.
 *
 * Given a document's text, returns either plain strings or `{ text }` objects
 * (so `splitText`, `chunks`, `splitMarkdown`, … all fit). If no splitter is
 * injected, `@lacspace/rag` falls back to a small built-in {@link simpleSplit}.
 */
export type Splitter = (
  text: string,
  opts?: Record<string, unknown>,
) => string[] | { text: string }[];

/** A record written into the vector store. */
export interface VectorRecord {
  /** Stable identifier for the chunk. */
  id: string;
  /** The embedding for {@link VectorRecord.text}. */
  vector: number[];
  /** Optional metadata copied onto retrieval results and used for filtering. */
  metadata?: Metadata;
  /** The original chunk text, so retrieval can return it without a second lookup. */
  text?: string;
}

/** A single hit returned by the vector store's `query`. */
export interface VectorQueryResult {
  /** Identifier of the matched record. */
  id: string;
  /** Similarity score — higher is more relevant. */
  score: number;
  /** Metadata stored with the record, if any. */
  metadata?: Metadata;
  /** The original chunk text, if the store kept it. */
  text?: string;
}

/** Options accepted by the store's `query`. */
export interface VectorQueryOptions {
  /** Maximum number of hits to return. */
  k?: number;
  /** Metadata filter applied by the store before scoring. */
  filter?: MetadataFilter;
}

/**
 * The vector-store contract — the subset of the `@lacspace/vector`
 * `VectorStore` that RAG needs.
 *
 * Both methods may be synchronous (as `@lacspace/vector` is) or return a
 * promise; `@lacspace/rag` awaits either way.
 */
export interface VectorStoreLike {
  /** Insert or replace records by id. */
  upsert(records: VectorRecord[]): Awaitable<void>;
  /** Return the nearest records to `vector`. */
  query(vector: number[], opts?: VectorQueryOptions): Awaitable<VectorQueryResult[]>;
}

/**
 * A document to index: a raw string, or an object with optional `id` and
 * `metadata` carried onto every chunk it produces.
 */
export type RagDocument =
  | string
  | {
      /** Identifier for the document. Chunk ids derive from it. */
      id?: string;
      /** The document text. */
      text: string;
      /** Metadata copied verbatim onto each of this document's chunks. */
      metadata?: Metadata;
    };

/** A chunk returned from {@link Rag.retrieve}. */
export interface RetrievedChunk {
  /** Identifier of the matched chunk. */
  id: string;
  /** The chunk text. */
  text: string;
  /** Similarity score from the store — higher is more relevant. */
  score: number;
  /** Metadata stored with the chunk, if any. */
  metadata?: Metadata;
}

/** Options for {@link Rag.index}. */
export interface IndexOptions {
  /**
   * Split each document into chunks before embedding. Default `true`. Set
   * `false` to embed each document as a single unit.
   */
  chunk?: boolean;
  /** Options forwarded to the splitter for this call. */
  splitOptions?: Record<string, unknown>;
  /** Metadata merged onto every chunk from this call (document metadata wins on conflict). */
  metadata?: Metadata;
}

/** The result of {@link Rag.index}. */
export interface IndexResult {
  /** How many chunks were embedded and upserted. */
  chunks: number;
  /** The ids assigned to those chunks, in order. */
  ids: string[];
}

/** Options for {@link Rag.retrieve}. */
export interface RetrieveOptions {
  /** Maximum number of chunks to return. Default `4`. */
  k?: number;
  /** Metadata filter forwarded to the store. */
  filter?: MetadataFilter;
  /** Drop hits scoring below this threshold. */
  minScore?: number;
}

/** How each retrieved chunk is rendered inside a context block. */
export type ContextTemplate = (chunk: RetrievedChunk, index: number) => string;

/** Options for {@link Rag.buildContext}. */
export interface BuildContextOptions {
  /** Hard cap on the assembled context length; blocks are dropped/trimmed to fit. */
  maxChars?: number;
  /** String placed between chunk blocks. Default `"\n\n"`. */
  separator?: string;
  /** Custom renderer for each chunk. Overrides {@link BuildContextOptions.withSources}. */
  template?: ContextTemplate;
  /** Prefix each block with a `[Source: …]` header (from `metadata.source` or the id). Default `false`. */
  withSources?: boolean;
}

/** How the final prompt string is assembled from its parts. */
export type PromptTemplate = (parts: {
  system: string;
  context: string;
  question: string;
}) => string;

/** Options for {@link Rag.buildPrompt}. Extends {@link BuildContextOptions}. */
export interface BuildPromptOptions extends BuildContextOptions {
  /** System instruction. Default is a grounded-answering instruction. */
  system?: string;
  /** Custom assembler for the final `prompt` string. */
  promptTemplate?: PromptTemplate;
}

/** The structured prompt returned by {@link Rag.buildPrompt}. */
export interface BuiltPrompt {
  /** The system instruction used. */
  system: string;
  /** The assembled context block. */
  context: string;
  /** The user's question. */
  question: string;
  /** The full, ready-to-send prompt string. */
  prompt: string;
}

/**
 * An injected generation function — matches the shape of any chat/completion
 * call. Kept injectable so `@lacspace/rag` never bundles an LLM or a key.
 */
export type Generate = (prompt: string) => Promise<string>;

/** Options for {@link Rag.answer}. Extends {@link RetrieveOptions} and {@link BuildPromptOptions}. */
export interface AnswerOptions extends RetrieveOptions, BuildPromptOptions {
  /** Generation function; overrides the one passed to {@link createRag}. */
  generate?: Generate;
}

/** Options for {@link createRag}. */
export interface RagOptions {
  /** The embedder used to embed documents and queries. */
  embed: Embedder;
  /** The vector store used to persist and search chunk embeddings. */
  store: VectorStoreLike;
  /** Optional splitter; defaults to the built-in {@link simpleSplit}. */
  split?: Splitter;
  /** Prefix for auto-generated chunk ids. Default `"doc"`. */
  idPrefix?: string;
  /** Optional generation function that enables {@link Rag.answer}. */
  generate?: Generate;
}

/** The RAG orchestrator returned by {@link createRag}. */
export interface Rag {
  /** Split (optional) → embed → upsert a document or documents. */
  index(docs: RagDocument | RagDocument[], opts?: IndexOptions): Promise<IndexResult>;
  /** Embed the query → search the store → return chunks. */
  retrieve(query: string, opts?: RetrieveOptions): Promise<RetrievedChunk[]>;
  /** Assemble retrieved chunks into a single context string (pure). */
  buildContext(chunks: RetrievedChunk[], opts?: BuildContextOptions): string;
  /** Build a ready-to-send RAG prompt from a query + chunks (pure; no LLM call). */
  buildPrompt(query: string, chunks: RetrievedChunk[], opts?: BuildPromptOptions): BuiltPrompt;
  /** retrieve → buildPrompt → generate. Requires an injected `generate`. */
  answer(query: string, opts?: AnswerOptions): Promise<string>;
}
