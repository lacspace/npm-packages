# @lacspace/rerank

[![npm](https://img.shields.io/npm/v/@lacspace/rerank.svg)](https://www.npmjs.com/package/@lacspace/rerank)
[![types](https://img.shields.io/badge/types-included-blue.svg)](https://www.npmjs.com/package/@lacspace/rerank)
[![zero-dependency](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/@lacspace/rerank)
[![license](https://img.shields.io/badge/licence-Lacspace%20Free-8a2be2.svg)](https://developer.lacspace.com/licenses/lacspace-free-1.0)

A tiny, **zero-dependency reranker** for RAG. First-stage retrieval (a vector search) is fast but noisy; reranking the small candidate set sharply improves precision. This package gives you the classic building blocks — **Okapi BM25**, **TF-IDF**, **keyword overlap**, **Reciprocal Rank Fusion**, **hybrid vector+lexical blending**, and **MMR** diversity — plus a single `rerank()` entry point and an **injectable seam for a cross-encoder / LLM reranker**.

- **Zero dependencies**, **keyless**, **isomorphic** (Node 18+, browser, edge).
- Consumes the retrieved-doc shape from [`@lacspace/rag`](https://developer.lacspace.com/packages/rag) — but needs nothing installed.
- Deterministic and fully typed. Any network/IO is *your* injected function.

## Install

```bash
npm i @lacspace/rerank
```

## The document shape

Everything works on plain `Doc`s — the same shape `@lacspace/rag` returns for a retrieved chunk:

```ts
interface Doc {
  id: string;
  text: string;
  score?: number;                        // upstream vector similarity
  metadata?: Record<string, unknown>;
  vector?: number[];                     // enables cosine MMR / hybrid blends
}
type Scored = Doc & { rerankScore: number };
```

## Quick start

```ts
import { rerank } from "@lacspace/rerank";

// `docs` are your retrieved chunks (e.g. from @lacspace/rag)
const top = await rerank("how do I rotate API keys?", docs, {
  method: "bm25",          // "bm25" (default) | "tfidf" | "hybrid"
  k: 5,                     // return the top 5
  diversity: { mmr: true, lambda: 0.6 }, // optional redundancy cut
});
// top: Scored[]  — sorted, most relevant first, each with .rerankScore
```

### Bring your own cross-encoder / LLM reranker

`rerank` is keyless — pass a `score` function and it wins over the built-in methods. Your function is the only place a network call ever happens:

```ts
const top = await rerank(query, docs, {
  score: async (q, docs) => {
    const res = await fetch(MY_RERANK_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ query: q, documents: docs.map((d) => d.text) }),
    });
    return (await res.json()).scores as number[]; // one score per doc, in order
  },
  k: 5,
});
```

### Fuse a vector list with a BM25 list (RRF)

```ts
import { reciprocalRankFusion, bm25 } from "@lacspace/rerank";

const lexical = bm25(query, candidates);           // Scored[]
const fused = reciprocalRankFusion([vectorHits, lexical], { k: 60 });
```

### Hybrid blend + diversity by hand

```ts
import { hybridRerank, mmr } from "@lacspace/rerank";

const blended = hybridRerank(query, docs, { vectorWeight: 0.7, lexicalWeight: 0.3 });
const diverse = mmr(blended, { lambda: 0.5, k: 8 }); // cosine over doc.vector, else Jaccard
```

## API

| Export | Signature | Description |
| --- | --- | --- |
| `rerank` | `(query, docs, opts?) => Promise<Scored[]>` | Main entry. Scores, optional MMR diversity, top-`k`. Uses injected `score` if given, else `method` (`bm25`\|`tfidf`\|`hybrid`). |
| `bm25` | `(query, docs, opts?) => Scored[]` | Classic Okapi BM25 (`k1=1.5`, `b=0.75`) over the candidate set. |
| `tfidfRerank` | `(query, docs, opts?) => Scored[]` | Cosine similarity of TF-IDF vectors (scores in `[0,1]`). |
| `keywordOverlapScore` | `(query, doc, opts?) => number` | Corpus-free lexical overlap — Jaccard (default) or query-coverage. |
| `reciprocalRankFusion` | `(rankings, opts?) => Doc[]` | RRF fusion of many ranked lists; fused value written to `score`. |
| `hybridRerank` | `(query, docs, opts?) => Scored[]` | Min-max blend of vector `doc.score` and a lexical score. |
| `mmr` | `(docs, opts) => Doc[]` | Maximal Marginal Relevance — reduces redundancy. |
| `cosineSim` / `jaccardSim` | `(a, b) => number` | Similarity primitives used by MMR. |
| `defaultTokenize` | `(text) => string[]` | Lowercase alphanumeric tokenizer (override anywhere via `tokenize`). |

Exported types: `Doc`, `Scored`, `RerankOptions`, `Bm25Options`, `TfidfOptions`, `KeywordOverlapOptions`, `RrfOptions`, `HybridOptions`, `MmrOptions`, `RerankDiversity`, `Tokenizer`, `RerankScorer`, `Similarity`.

### Injectable seams (no hard deps)

- **`score: (query, docs) => number[] | Promise<number[]>`** — a cross-encoder or LLM reranker.
- **`similarity: (a: Doc, b: Doc) => number`** — custom pairwise similarity for MMR (default: cosine over `doc.vector`, else token Jaccard).
- **`tokenize: (text) => string[]`** — swap in stemming, n-grams or CJK segmentation.

## Works great with

- **[`@lacspace/rag`](https://developer.lacspace.com/packages/rag)** — retrieves the chunks; drop `rerank()` between retrieval and prompt assembly. Same `Doc`/`RetrievedChunk` shape.
- **[`@lacspace/vector`](https://developer.lacspace.com/packages/vector)** — its query hits carry `id`/`score`/`vector`, exactly what hybrid + cosine MMR use.
- **[`@lacspace/embeddings`](https://developer.lacspace.com/packages/embeddings)** — produces the `doc.vector`s.
- **[`@lacspace/chunk`](https://developer.lacspace.com/packages/chunk)** — the upstream text splitter.

## Limitations

- **Corpus-local statistics.** BM25/TF-IDF idf is computed from the *candidate set* you pass, not a global index — correct for reranking a retrieved list, but scores aren't comparable across different candidate sets.
- **No built-in cross-encoder or embedder.** Semantic reranking beyond lexical + vector-blend requires your injected `score`; there is deliberately no model dependency.
- **Default tokenizer is Latin-oriented** (lowercase alphanumeric split). For CJK or morphologically rich languages, inject a `tokenize`.
- **Hybrid/MMR normalization is min-max** across the candidate set; a single outlier score compresses the rest, and an all-equal set normalizes to zero.
- **MMR similarity** defaults to cosine only when *both* docs carry a `vector`, otherwise token Jaccard — mixing vectored and vector-less docs falls back to lexical similarity.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/rerank` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/rerank
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
