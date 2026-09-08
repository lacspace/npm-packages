<div align="center">

# @lacspace/vector

**A tiny in-memory vector store for RAG and semantic search — zero dependencies, isomorphic, fully typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/vector?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/vector)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/vector?label=minzip)](https://bundlephobia.com/package/@lacspace/vector)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/vector)
[![license](https://img.shields.io/npm/l/@lacspace/vector?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The storage layer of a retrieval pipeline, with nothing to install and nothing to run. Keep your embeddings in memory, upsert by id, and ask for the **k nearest neighbours** to any query vector — with `cosine`, `dot` or `euclidean` similarity, metadata filtering and plain-JSON persistence. Brute-force and honest about it: perfect up to tens of thousands of vectors, not a billion-scale ANN index.

- 🗄️ **Simple store API** — `upsert` / `get` / `delete` / `has` / `size` / `clear` / `all`, records keyed by `id`
- 🔎 **k-NN query** — `query(vector, { k, filter, minScore })` and `queryById(id, …)`, always **best-first**
- 📐 **Three metrics** — cosine (default), dot product, euclidean — the pure helpers are exported too
- 🏷️ **Metadata & text** — carry any payload on each record and filter on it at query time
- 💾 **Persistence** — `toJSON()` / `fromJSON()` round-trip to plain JSON (no IO, bring your own storage)
- 🛡️ **Dimension guard** — mismatched vectors are rejected before they corrupt a query
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed

## Install

```bash
npm i @lacspace/vector
```

## Quick start

```ts
import { createVectorStore } from "@lacspace/vector";

const store = createVectorStore({ metric: "cosine" });

store.upsert([
  { id: "doc-1", vector: [0.02, 0.91, 0.10], text: "How to reset my password", metadata: { section: "auth" } },
  { id: "doc-2", vector: [0.88, 0.04, 0.20], text: "Refund policy",            metadata: { section: "billing" } },
  { id: "doc-3", vector: [0.10, 0.85, 0.05], text: "Two-factor authentication", metadata: { section: "auth" } },
]);

// nearest neighbours to a query embedding
const hits = store.query([0.05, 0.9, 0.08], { k: 2 });
// → [{ id: "doc-1", score: 0.99, text: "…", metadata: { section: "auth" } }, …]

// filter on metadata while you search
const authOnly = store.query([0.05, 0.9, 0.08], {
  k: 5,
  filter: (r) => r.metadata?.section === "auth",
  minScore: 0.5,
});
```

## In a RAG pipeline

`@lacspace/vector` is the middle of the Lacspace RAG stack — it doesn't embed and it doesn't call an LLM, it just stores and ranks vectors. Bring your own embedder (any `(texts) => number[][]` function works, keyless):

```ts
import { createVectorStore } from "@lacspace/vector";

const store = createVectorStore({ metric: "cosine" });

// `embed` is injected — could be @lacspace/embeddings, an API call, anything
async function index(docs: { id: string; text: string }[], embed: (t: string[]) => Promise<number[][]>) {
  const vectors = await embed(docs.map((d) => d.text));
  store.upsert(docs.map((d, i) => ({ id: d.id, vector: vectors[i]!, text: d.text })));
}

async function retrieve(question: string, embed: (t: string[]) => Promise<number[][]>) {
  const [q] = await embed([question]);
  return store.query(q!, { k: 4 }); // feed these chunks to your prompt
}
```

## Persist and restore

```ts
const snapshot = store.toJSON();          // plain JSON — version, metric, dimensions, records
localStorage.setItem("kb", JSON.stringify(snapshot));

import { fromJSON } from "@lacspace/vector";
const restored = fromJSON(JSON.parse(localStorage.getItem("kb")!));
```

## Standalone metric helpers

The math is exported, so you can rank vectors without a store:

```ts
import { cosine, dot, euclidean } from "@lacspace/vector";

cosine([1, 0], [0.9, 0.1]); // ~0.99
dot([1, 2, 3], [4, 5, 6]);  // 32
euclidean([0, 0], [3, 4]);  // 5
```

## API

| Export | Signature | Description |
| --- | --- | --- |
| `createVectorStore` | `(opts?: VectorStoreOptions) => VectorStore` | Create an in-memory store (`metric`, `dimensions`). |
| `fromJSON` | `(data: SerializedStore) => VectorStore` | Rehydrate a store from a snapshot. |
| `store.upsert` | `(records: VectorRecord \| VectorRecord[]) => void` | Insert/overwrite by `id` (validated atomically). |
| `store.get` | `(id: string) => VectorRecord \| undefined` | Fetch one record (a clone). |
| `store.delete` | `(id: string) => boolean` | Remove a record; `true` if it existed. |
| `store.has` | `(id: string) => boolean` | Existence check. |
| `store.size` | `number` | Record count. |
| `store.clear` | `() => void` | Drop all records. |
| `store.all` | `() => VectorRecord[]` | Every record (clones). |
| `store.query` | `(vector: number[], opts?: QueryOptions) => QueryResult[]` | k-NN, best-first. |
| `store.queryById` | `(id: string, opts?: QueryByIdOptions) => QueryResult[]` | k-NN to an existing record. |
| `store.toJSON` | `() => SerializedStore` | Plain-JSON snapshot. |
| `store.load` | `(data: SerializedStore) => VectorStore` | Replace contents from a snapshot (chainable). |
| `cosine` / `dot` / `euclidean` | `(a: number[], b: number[]) => number` | Pure metric helpers. |
| `euclideanSimilarity` / `similarityFor` | — | L2-as-similarity, and metric → ranking fn. |

**Options** — `QueryOptions`: `{ k?: number; filter?: (rec) => boolean; minScore?: number; includeVectors?: boolean }`. `QueryByIdOptions` adds `includeSelf?: boolean`.

**Types** — `VectorRecord`, `QueryResult`, `VectorStore`, `VectorStoreOptions`, `QueryOptions`, `QueryByIdOptions`, `DistanceMetric`, `SerializedStore`.

## Works great with

- **[@lacspace/embeddings](https://developer.lacspace.com/packages/embeddings)** — turn text into the `vector` you upsert (keyless, provider-agnostic).
- **[@lacspace/rag](https://developer.lacspace.com/packages/rag)** — orchestrates embed → store → retrieve → prompt; it accepts this store's shape directly.
- **[@lacspace/chunk](https://developer.lacspace.com/packages/chunk)** — split documents into the chunks you embed and store.

## Scores & ordering

Every metric is normalised to **higher-is-better** so results always sort best-first:

- `cosine` — cosine similarity, roughly `[-1, 1]`.
- `dot` — raw dot product (magnitude matters; use when embeddings are pre-normalised).
- `euclidean` — returned as `1 / (1 + distance)`, so identical vectors score `1` and nearer points score higher.

## Limitations

- **Brute-force, in-memory.** Every query scans every record (O(n·d)). Great to ~tens of thousands of vectors; it is **not** an approximate-nearest-neighbour (ANN) index and won't scale to millions/billions — reach for a dedicated ANN engine there.
- **No persistence IO.** `toJSON`/`fromJSON` hand you a plain object; you choose where it lives (file, KV, `localStorage`, DB). Nothing is written for you.
- **No built-in embedder.** You supply vectors; the package deliberately depends on no model or API (pair it with `@lacspace/embeddings`).
- **One length per store.** All vectors must share the same dimension; mismatches throw rather than silently mis-ranking.
- **Snapshots hold full float vectors** as JSON numbers — large corpora produce large snapshots (no quantisation).

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/vector` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/vector
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
