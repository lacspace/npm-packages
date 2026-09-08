import type {
  EmbedAdapter,
  EmbedProvider,
  EmbedRequest,
  ResolvedEmbedOptions,
} from "./types";

/** Thrown for configuration/response problems that aren't network errors. */
export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/** Default base URL per built-in provider (`openai-compatible` has none). */
export const DEFAULT_BASE_URL: Record<EmbedProvider, string> = {
  openai: "https://api.openai.com/v1",
  "openai-compatible": "",
  ollama: "http://localhost:11434",
  google: "https://generativelanguage.googleapis.com/v1beta",
  cohere: "https://api.cohere.com/v1",
};

function trimTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  return `${trimTrailingSlash(base)}/${path.replace(/^\/+/, "")}`;
}

function jsonHeaders(
  opts: ResolvedEmbedOptions,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...extra,
    ...(opts.headers ?? {}),
  };
}

/** Read a `data`/`embeddings` array of numbers defensively. */
function asVectors(rows: unknown, provider: string): number[][] {
  if (!Array.isArray(rows)) {
    throw new EmbeddingError(
      `${provider}: response did not contain an embeddings array.`,
    );
  }
  return rows.map((r) => {
    if (!Array.isArray(r) || !r.every((n) => typeof n === "number")) {
      throw new EmbeddingError(`${provider}: an embedding was not a number[].`);
    }
    return r as number[];
  });
}

/**
 * OpenAI `/embeddings` shape — also used by `openai-compatible` (Azure, vLLM,
 * LM Studio, Together, Mistral, …). Accepts either an API root or a full
 * `/embeddings` URL as `baseUrl`.
 */
const openaiAdapter: EmbedAdapter = {
  name: "openai",
  maxBatch: 2048,
  buildRequest(texts, opts): EmbedRequest {
    if (!opts.baseUrl) {
      throw new EmbeddingError(
        "openai-compatible provider requires a `baseUrl`.",
      );
    }
    const url = /\/embeddings\/?$/.test(opts.baseUrl)
      ? opts.baseUrl
      : joinUrl(opts.baseUrl, "embeddings");
    return {
      url,
      headers: jsonHeaders(
        opts,
        opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
      ),
      body: {
        model: opts.model,
        input: texts,
        ...(opts.dimensions != null ? { dimensions: opts.dimensions } : {}),
      },
    };
  },
  parseResponse(json): number[][] {
    const data = (json as { data?: unknown }).data;
    if (!Array.isArray(data)) {
      throw new EmbeddingError("openai: response missing `data` array.");
    }
    // Preserve request order via each item's `index` when present.
    const sorted = [...data].sort((a, b) => {
      const ai = (a as { index?: number }).index ?? 0;
      const bi = (b as { index?: number }).index ?? 0;
      return ai - bi;
    });
    return asVectors(
      sorted.map((d) => (d as { embedding?: unknown }).embedding),
      "openai",
    );
  },
};

/**
 * Ollama `/api/embeddings` shape. This endpoint embeds a single `prompt` per
 * call, so `maxBatch` is 1 and the client issues one request per text.
 */
const ollamaAdapter: EmbedAdapter = {
  name: "ollama",
  maxBatch: 1,
  buildRequest(texts, opts): EmbedRequest {
    return {
      url: joinUrl(opts.baseUrl, "api/embeddings"),
      headers: jsonHeaders(
        opts,
        opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
      ),
      body: { model: opts.model, prompt: texts[0] ?? "" },
    };
  },
  parseResponse(json): number[][] {
    const embedding = (json as { embedding?: unknown }).embedding;
    return asVectors([embedding], "ollama");
  },
};

/** Google Gemini `:batchEmbedContents` shape. */
const googleAdapter: EmbedAdapter = {
  name: "google",
  maxBatch: 100,
  buildRequest(texts, opts): EmbedRequest {
    const modelPath = opts.model.startsWith("models/")
      ? opts.model
      : `models/${opts.model}`;
    return {
      url: joinUrl(opts.baseUrl, `${modelPath}:batchEmbedContents`),
      headers: jsonHeaders(
        opts,
        opts.apiKey ? { "x-goog-api-key": opts.apiKey } : {},
      ),
      body: {
        requests: texts.map((t) => ({
          model: modelPath,
          content: { parts: [{ text: t }] },
          ...(opts.dimensions != null
            ? { outputDimensionality: opts.dimensions }
            : {}),
        })),
      },
    };
  },
  parseResponse(json): number[][] {
    const embeddings = (json as { embeddings?: unknown }).embeddings;
    if (!Array.isArray(embeddings)) {
      throw new EmbeddingError("google: response missing `embeddings` array.");
    }
    return asVectors(
      embeddings.map((e) => (e as { values?: unknown }).values),
      "google",
    );
  },
};

/** Cohere `/embed` shape (handles both v1 array and v2 `{ float }` bodies). */
const cohereAdapter: EmbedAdapter = {
  name: "cohere",
  maxBatch: 96,
  buildRequest(texts, opts): EmbedRequest {
    return {
      url: joinUrl(opts.baseUrl, "embed"),
      headers: jsonHeaders(
        opts,
        opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
      ),
      body: {
        model: opts.model,
        texts,
        input_type: "search_document",
        embedding_types: ["float"],
      },
    };
  },
  parseResponse(json): number[][] {
    const emb = (json as { embeddings?: unknown }).embeddings;
    // v1: `embeddings` is number[][]; v2: `embeddings.float` is number[][].
    const rows = Array.isArray(emb)
      ? emb
      : (emb as { float?: unknown } | undefined)?.float;
    return asVectors(rows, "cohere");
  },
};

const ADAPTERS: Record<EmbedProvider, EmbedAdapter> = {
  openai: openaiAdapter,
  "openai-compatible": openaiAdapter,
  ollama: ollamaAdapter,
  google: googleAdapter,
  cohere: cohereAdapter,
};

/** Look up a built-in adapter by provider name. */
export function getAdapter(provider: EmbedProvider): EmbedAdapter {
  const a = ADAPTERS[provider];
  if (!a) throw new EmbeddingError(`Unknown embeddings provider: ${provider}`);
  return a;
}
