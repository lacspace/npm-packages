/**
 * Shared types for @lacspace/embeddings — a provider-agnostic, keyless
 * embeddings client and pure vector math.
 */

/** A dense embedding vector — just an array of numbers. */
export type Vector = number[];

/**
 * Which upstream embeddings API to talk to.
 *
 * - `openai` — the OpenAI `/embeddings` endpoint (and, with `openai-compatible`,
 *   anything that mirrors it: Azure OpenAI, Together, Groq, Mistral, vLLM, LM Studio…).
 * - `ollama` — a local Ollama server's `/api/embeddings` endpoint.
 * - `google` — Google Gemini `:batchEmbedContents`.
 * - `cohere` — the Cohere `/embed` endpoint.
 */
export type EmbedProvider =
  | "openai"
  | "openai-compatible"
  | "ollama"
  | "google"
  | "cohere";

/**
 * A `fetch`-compatible function. Inject via {@link EmbedOptions.fetchImpl} to
 * route requests through a proxy, add instrumentation, or stub the network in
 * tests. Defaults to the global `fetch`.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Options for {@link embed} / {@link embedOne} / {@link createEmbedder}.
 * Keyless by design — you supply the endpoint, model and (optionally) key.
 */
export interface EmbedOptions {
  /** Model id, e.g. `"text-embedding-3-small"` or `"nomic-embed-text"`. */
  model: string;
  /**
   * Base URL of the API. Optional — each built-in provider has a sensible
   * default (e.g. `https://api.openai.com/v1`), except `openai-compatible`
   * which requires one. For `openai`-style providers you may pass either the
   * API root or the full `/embeddings` URL.
   */
  baseUrl?: string;
  /** API key/token. Omitted for keyless/local endpoints (e.g. Ollama). */
  apiKey?: string;
  /** Which provider shape to speak. Defaults to `"openai"`. */
  provider?: EmbedProvider;
  /** A custom adapter — overrides `provider` entirely. */
  adapter?: EmbedAdapter;
  /** Custom `fetch` (proxy / instrumentation / tests). Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
  /** Requested output dimensionality, when the provider supports it (e.g. OpenAI v3). */
  dimensions?: number;
  /** Max texts per request. Clamped to the adapter's own limit. Defaults to `96`. */
  batchSize?: number;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Abort signal forwarded to `fetch`. */
  signal?: AbortSignal;
}

/** {@link EmbedOptions} after defaults are applied — what adapters receive. */
export interface ResolvedEmbedOptions {
  model: string;
  baseUrl: string;
  apiKey?: string;
  dimensions?: number;
  headers?: Record<string, string>;
}

/** A single HTTP request an adapter wants the client to send. */
export interface EmbedRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * A pluggable provider adapter. Implement this to support any embeddings API
 * without a code change here — pass it as {@link EmbedOptions.adapter}.
 */
export interface EmbedAdapter {
  /** Human-readable name (used in error messages). */
  name: string;
  /** Largest number of texts this adapter can embed in one request. */
  maxBatch?: number;
  /** Build the HTTP request for one batch of texts. */
  buildRequest(texts: string[], opts: ResolvedEmbedOptions): EmbedRequest;
  /** Parse the provider's JSON response into one vector per input text. */
  parseResponse(json: unknown, texts: string[]): number[][];
}

/**
 * The shared "bound embedder" shape.
 *
 * `(texts: string[]) => Promise<number[][]>` is the exact contract that
 * `@lacspace/vector` and `@lacspace/rag` accept — so an embedder made here
 * snaps straight into the rest of the RAG stack. Get one from
 * {@link createEmbedder}.
 */
export type Embedder = (texts: string[]) => Promise<number[][]>;

/** A `{ index, score }` hit returned by {@link topKSimilar}. */
export interface SimilarityHit {
  /** Position of the candidate in the input array. */
  index: number;
  /** Cosine similarity to the query, in `[-1, 1]`. */
  score: number;
}
