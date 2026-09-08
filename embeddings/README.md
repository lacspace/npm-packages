<div align="center">

# @lacspace/embeddings

**A tiny, provider-agnostic, keyless embeddings client + pure vector math — the entry point of the Lacspace RAG stack. Zero dependencies, isomorphic, fully typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/embeddings?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/embeddings)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/embeddings?label=minzip)](https://bundlephobia.com/package/@lacspace/embeddings)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/embeddings)
[![license](https://img.shields.io/npm/l/@lacspace/embeddings?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> One small module for both halves of "turn text into vectors": a **keyless client** that calls any OpenAI-compatible, Ollama, Google or Cohere embeddings endpoint through an **injectable `fetch`**, and the **pure vector math** (cosine, dot, euclidean, normalize, mean-pool, top-k) every retrieval pipeline needs. No SDK, no API key baked in, no network unless you make a call.

- 🔌 **Provider-agnostic** — OpenAI & OpenAI-compatible (Azure, Together, Mistral, vLLM, LM Studio…), Ollama, Google Gemini and Cohere out of the box, or bring your own `adapter`
- 🔑 **Keyless by design** — you pass the endpoint/model/key (or none, for a local Ollama); nothing is bundled
- 💉 **Injectable `fetchImpl`** — defaults to global `fetch`; swap it for a proxy, instrumentation, or a fake in tests
- 📦 **Batches automatically** — large inputs are chunked to the provider's per-request limit
- 🧮 **Pure vector math** — `cosineSimilarity`, `dotProduct`, `euclideanDistance`, `normalize`, `magnitude`, `meanPool`, `topKSimilar` — zero IO, deterministic
- 🤝 **Snaps into the RAG stack** — `createEmbedder` returns the exact `(texts) => Promise<number[][]>` shape `@lacspace/vector` and `@lacspace/rag` accept
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed

## Install

```bash
npm i @lacspace/embeddings
```

## Embed some text

```ts
import { embed, embedOne } from "@lacspace/embeddings";

const vectors = await embed(["hello world", "goodbye world"], {
  provider: "openai",                 // the default
  model: "text-embedding-3-small",
  apiKey: process.env.OPENAI_API_KEY, // you supply it — never bundled
});
// → number[][], one vector per input, in order

const one = await embedOne("just this", {
  model: "text-embedding-3-small",
  apiKey: process.env.OPENAI_API_KEY,
});
```

## Bind an embedder for the rest of the stack

`createEmbedder` returns a function of the **exact shape the RAG stack accepts** — `(texts: string[]) => Promise<number[][]>`:

```ts
import { createEmbedder } from "@lacspace/embeddings";

const embedder = createEmbedder({
  provider: "openai",
  model: "text-embedding-3-small",
  apiKey: process.env.OPENAI_API_KEY,
});

const vecs = await embedder(["a", "b", "c"]); // number[][]
// pass `embedder` straight into @lacspace/vector or @lacspace/rag
```

## Local & alternative providers

```ts
// Local Ollama — no key at all
await embed(["hi"], { provider: "ollama", model: "nomic-embed-text" });

// Google Gemini
await embed(["hi"], { provider: "google", model: "text-embedding-004", apiKey: KEY });

// Cohere
await embed(["hi"], { provider: "cohere", model: "embed-english-v3.0", apiKey: KEY });

// Any OpenAI-compatible endpoint (Azure, Together, vLLM, LM Studio, …)
await embed(["hi"], {
  provider: "openai-compatible",
  baseUrl: "https://api.together.xyz/v1",
  model: "togethercomputer/m2-bert-80M-8k-retrieval",
  apiKey: KEY,
});
```

Need a provider that isn't built in? Pass a custom `adapter`:

```ts
import { embed, type EmbedAdapter } from "@lacspace/embeddings";

const myAdapter: EmbedAdapter = {
  name: "my-service",
  maxBatch: 32,
  buildRequest: (texts, opts) => ({
    url: `${opts.baseUrl}/vectors`,
    headers: { "Content-Type": "application/json" },
    body: { model: opts.model, inputs: texts },
  }),
  parseResponse: (json) => (json as { vectors: number[][] }).vectors,
};

await embed(["hi"], { model: "x", baseUrl: "https://…", adapter: myAdapter });
```

## Vector math (zero IO)

```ts
import {
  cosineSimilarity, dotProduct, euclideanDistance,
  normalize, magnitude, meanPool, topKSimilar,
} from "@lacspace/embeddings";

cosineSimilarity([1, 0], [1, 0]);   // 1
cosineSimilarity([1, 0], [0, 1]);   // 0
euclideanDistance([0, 0], [3, 4]);  // 5
magnitude([3, 4]);                  // 5
normalize([3, 4]);                  // [0.6, 0.8]
meanPool([[2, 4], [4, 8]]);         // [3, 6]

// rank candidates against a query embedding
topKSimilar(queryVec, candidateVecs, 5);
// → [{ index, score }, ...]  (highest cosine first)
```

## Test without a network

Everything network-y goes through an injectable `fetchImpl`, so tests never hit the wire:

```ts
const fakeFetch = async (url, init) =>
  new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }));

const v = await embedOne("hi", { model: "m", apiKey: "k", fetchImpl: fakeFetch });
```

## API

### Client

| Export | Signature | Notes |
| --- | --- | --- |
| `embed` | `(texts: string[], opts: EmbedOptions) => Promise<number[][]>` | One vector per input, in order; batches large inputs |
| `embedOne` | `(text: string, opts: EmbedOptions) => Promise<number[]>` | Convenience for a single text |
| `createEmbedder` | `(opts: EmbedOptions) => Embedder` | Bound `(texts) => Promise<number[][]>` for the RAG stack |
| `getAdapter` | `(provider: EmbedProvider) => EmbedAdapter` | The built-in adapter for a provider |
| `DEFAULT_BASE_URL` | `Record<EmbedProvider, string>` | Default endpoint per provider |
| `DEFAULT_BATCH_SIZE` | `number` (`96`) | Fallback batch size |
| `EmbeddingError` | `class extends Error` | Config/response errors |

### Vector math

| Export | Signature |
| --- | --- |
| `cosineSimilarity` | `(a: Vector, b: Vector) => number` |
| `dotProduct` | `(a: Vector, b: Vector) => number` |
| `euclideanDistance` | `(a: Vector, b: Vector) => number` |
| `normalize` | `(v: Vector) => Vector` |
| `magnitude` | `(v: Vector) => number` |
| `meanPool` | `(vectors: Vector[]) => Vector` |
| `topKSimilar` | `(query: Vector, candidates: Vector[], k: number) => SimilarityHit[]` |
| `VectorError` | `class extends Error` |

**`EmbedOptions`** — `{ model, baseUrl?, apiKey?, provider?, adapter?, fetchImpl?, dimensions?, batchSize?, headers?, signal? }`. `provider` defaults to `"openai"`; `baseUrl` defaults per provider (required for `openai-compatible`).

**Exported types** — `EmbedOptions`, `EmbedProvider`, `Embedder`, `Vector` (= `number[]`), plus `EmbedAdapter`, `EmbedRequest`, `ResolvedEmbedOptions`, `FetchLike`, `SimilarityHit`.

**`Embedder`** = `(texts: string[]) => Promise<number[][]>` — the shared shape the whole RAG stack passes around.

## Works great with

Compose the Lacspace RAG stack end to end:

**[@lacspace/chunk](https://developer.lacspace.com/packages/chunk) (split) → @lacspace/embeddings (embed) → [@lacspace/vector](https://developer.lacspace.com/packages/vector) (store) → [@lacspace/rag](https://developer.lacspace.com/packages/rag) (retrieve).**

Because `createEmbedder` returns the exact `(texts) => Promise<number[][]>` shape those packages accept, there's no adapter glue — and no hard dependency, so this package installs and tests standalone.

## Limitations

- **You bring the endpoint & key.** Keyless means nothing is bundled — supply `apiKey`/`baseUrl`/`model` yourself (or run a keyless local Ollama).
- **Adapters cover the common response shapes**, not every provider quirk (custom error envelopes, non-standard batching, `input_type` tuning for asymmetric retrieval). Pass a custom `adapter` when you need full control.
- **Ollama's `/api/embeddings` is single-text**, so it issues one request per input (`maxBatch: 1`); use a batching-capable endpoint for high throughput.
- **Batches run sequentially** for predictable ordering and gentler rate-limit behavior — not maximum parallelism.
- **Vector math assumes finite, equal-length numeric vectors**; ragged or mismatched inputs throw `VectorError`. `cosineSimilarity`/`normalize` treat a zero vector as having no direction (return `0` / an unchanged copy) rather than `NaN`.
- **No caching, retries or rate-limiting** are built in — layer [@lacspace/retry](https://developer.lacspace.com/packages/retry) or your own wrapper around the injected `fetchImpl`.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/embeddings` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/embeddings
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
