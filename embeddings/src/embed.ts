import type {
  EmbedAdapter,
  EmbedOptions,
  Embedder,
  FetchLike,
  ResolvedEmbedOptions,
} from "./types";
import {
  DEFAULT_BASE_URL,
  EmbeddingError,
  getAdapter,
} from "./providers";

/** Default number of texts per request when the caller doesn't set `batchSize`. */
export const DEFAULT_BATCH_SIZE = 96;

function resolveAdapter(opts: EmbedOptions): EmbedAdapter {
  if (opts.adapter) return opts.adapter;
  return getAdapter(opts.provider ?? "openai");
}

function resolveOptions(opts: EmbedOptions): ResolvedEmbedOptions {
  if (!opts.model) {
    throw new EmbeddingError("`model` is required.");
  }
  const provider = opts.provider ?? "openai";
  const baseUrl =
    opts.baseUrl ?? (opts.adapter ? "" : DEFAULT_BASE_URL[provider]);
  return {
    model: opts.model,
    baseUrl,
    apiKey: opts.apiKey,
    dimensions: opts.dimensions,
    headers: opts.headers,
  };
}

function batches<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Embed one batch of texts through the given adapter, using the injected fetch.
 * Never called for an empty batch.
 */
async function embedBatch(
  adapter: EmbedAdapter,
  texts: string[],
  resolved: ResolvedEmbedOptions,
  doFetch: FetchLike,
  signal?: AbortSignal,
): Promise<number[][]> {
  const req = adapter.buildRequest(texts, resolved);

  let res: Response;
  try {
    res = await doFetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    });
  } catch (err) {
    throw new EmbeddingError(
      `Request to ${adapter.name} failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!res.ok) {
    const body = await readBody(res);
    const detail =
      typeof body === "string"
        ? body
        : JSON.stringify((body as { error?: unknown })?.error ?? body ?? "");
    throw new EmbeddingError(
      `${adapter.name} request failed (${res.status}): ${detail}`,
    );
  }

  const json = await readBody(res);
  const vectors = adapter.parseResponse(json, texts);
  if (vectors.length !== texts.length) {
    throw new EmbeddingError(
      `${adapter.name}: expected ${texts.length} embeddings, got ${vectors.length}.`,
    );
  }
  return vectors;
}

/**
 * Embed a list of texts, returning one vector per input in the same order.
 *
 * Large inputs are split into batches (`opts.batchSize`, clamped to the
 * provider's own limit) and sent sequentially. The network call goes through
 * `opts.fetchImpl` when provided, otherwise the global `fetch` — nothing is
 * imported or bundled, and no key is required unless your endpoint needs one.
 *
 * ```ts
 * const vecs = await embed(["hello", "world"], {
 *   provider: "openai",
 *   model: "text-embedding-3-small",
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * ```
 */
export async function embed(
  texts: string[],
  opts: EmbedOptions,
): Promise<number[][]> {
  if (!Array.isArray(texts)) {
    throw new EmbeddingError("`texts` must be a string[].");
  }
  if (texts.length === 0) return [];

  const adapter = resolveAdapter(opts);
  const resolved = resolveOptions(opts);
  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as FetchLike);

  const requested = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const limit = adapter.maxBatch ?? requested;
  const size = Math.max(1, Math.min(requested, limit));

  const out: number[][] = [];
  for (const batch of batches(texts, size)) {
    const vectors = await embedBatch(
      adapter,
      batch,
      resolved,
      doFetch,
      opts.signal,
    );
    for (const v of vectors) out.push(v);
  }
  return out;
}

/** Embed a single text and return its vector. */
export async function embedOne(
  text: string,
  opts: EmbedOptions,
): Promise<number[]> {
  const [vector] = await embed([text], opts);
  if (!vector) {
    throw new EmbeddingError("No embedding returned for the input text.");
  }
  return vector;
}

/**
 * Bind options once and get back an {@link Embedder} — a function of the exact
 * shape `(texts: string[]) => Promise<number[][]>` that `@lacspace/vector` and
 * `@lacspace/rag` accept. This shared shape is what lets the RAG stack snap
 * together.
 *
 * ```ts
 * const embedder = createEmbedder({
 *   provider: "openai",
 *   model: "text-embedding-3-small",
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * const store = await createVectorStore({ embedder });   // @lacspace/vector
 * ```
 */
export function createEmbedder(opts: EmbedOptions): Embedder {
  return (texts: string[]) => embed(texts, opts);
}
