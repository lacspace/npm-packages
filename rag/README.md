# @lacspace/rag

[![npm](https://img.shields.io/npm/v/@lacspace/rag.svg)](https://www.npmjs.com/package/@lacspace/rag)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/@lacspace/rag)
[![types](https://img.shields.io/badge/types-included-blue.svg)](https://www.npmjs.com/package/@lacspace/rag)
[![isomorphic](https://img.shields.io/badge/runtime-node%20%7C%20browser%20%7C%20edge-8A2BE2.svg)](https://www.npmjs.com/package/@lacspace/rag)

**The glue of a Retrieval-Augmented Generation pipeline.** `@lacspace/rag` indexes documents and retrieves + assembles prompt context — it composes an **embedder**, a **vector store** and (optionally) a **splitter**, but has **zero hard dependencies**: every collaborator is an injectable, duck-typed interface. Plug in the Lacspace siblings or any compatible implementation, and test the whole thing with in-memory fakes — no network, no keys.

- **Zero dependencies** — nothing to install transitively.
- **Keyless** — never bundles or requires an API key; you inject the embedder / generator.
- **Isomorphic** — Node 18+, browsers and edge runtimes. No Node built-ins.
- **Injectable everything** — embedder, store, splitter and generator are all functions/objects you pass in, so it is trivially testable and provider-agnostic.
- **Pure prompt assembly** — `buildContext` / `buildPrompt` never call out; you stay in control of the LLM call.

## Install

```bash
npm install @lacspace/rag
```

## Quick start

```ts
import { createRag } from "@lacspace/rag";

// Bring your own embedder + store (here: the Lacspace siblings).
import { openai } from "@lacspace/embeddings"; // any (texts) => Promise<number[][]>
import { MemoryStore } from "@lacspace/vector"; // any { upsert, query }

const rag = createRag({
  embed: openai({ apiKey: process.env.OPENAI_API_KEY }),
  store: new MemoryStore(),
});

// 1. Index — split → embed → upsert
await rag.index([
  { id: "faq", text: longFaqMarkdown, metadata: { source: "faq" } },
  "Any plain string works too.",
]);

// 2. Retrieve — embed query → search
const chunks = await rag.retrieve("How do refunds work?", { k: 4 });

// 3. Assemble a prompt (pure — no LLM call)
const { prompt } = rag.buildPrompt("How do refunds work?", chunks, { withSources: true });

// 4. Call whatever LLM you like with `prompt`.
```

Prefer one call? Inject a `generate` function and use `answer`:

```ts
const rag = createRag({ embed, store, generate: (prompt) => myLLM(prompt) });
const reply = await rag.answer("How do refunds work?", { k: 4 });
```

## Injectable contracts

`@lacspace/rag` accepts these exact shapes, matching the sibling packages:

```ts
// @lacspace/embeddings — Embedder
type Embedder = (texts: string[]) => Promise<number[][]>;

// @lacspace/vector — the VectorStore subset RAG needs (sync or async)
interface VectorStoreLike {
  upsert(records: { id: string; vector: number[]; metadata?: object; text?: string }[]): void | Promise<void>;
  query(vector: number[], opts?: { k?: number; filter?: object }): { id: string; score: number; metadata?: object; text?: string }[] | Promise<...>;
}

// @lacspace/chunk — optional splitter (defaults to a built-in simpleSplit)
type Splitter = (text: string, opts?) => string[] | { text: string }[];

// Optional generator to enable answer()
type Generate = (prompt: string) => Promise<string>;
```

## API

| Export | Signature | Description |
| --- | --- | --- |
| `createRag` | `(opts: RagOptions) => Rag` | Build the orchestrator from `{ embed, store, split?, idPrefix?, generate? }`. |
| `Rag.index` | `(docs, opts?) => Promise<{ chunks; ids }>` | Split (optional) → embed → upsert. `docs` is a `RagDocument` or an array. |
| `Rag.retrieve` | `(query, opts?) => Promise<RetrievedChunk[]>` | Embed the query → search the store. Supports `k`, `filter`, `minScore`. |
| `Rag.buildContext` | `(chunks, opts?) => string` | Pure. Assemble chunks into a context string. `maxChars`, `separator`, `template`, `withSources`. |
| `Rag.buildPrompt` | `(query, chunks, opts?) => BuiltPrompt` | Pure. `{ system, context, question, prompt }` — a ready-to-send RAG prompt. |
| `Rag.answer` | `(query, opts?) => Promise<string>` | retrieve → buildPrompt → `generate`. Requires an injected generator. |
| `buildContext` / `buildPrompt` | — | The pure assemblers, also exported standalone. |
| `simpleSplit` | `(text, opts?) => string[]` | The built-in fallback splitter. |

Exported types: `RagDocument`, `RetrievedChunk`, `Rag`, `RagOptions`, `Embedder`, `VectorStoreLike`, `Splitter`, `Generate`, `IndexOptions`, `RetrieveOptions`, `BuildContextOptions`, `BuildPromptOptions`, `BuiltPrompt`, and more.

## Works great with

- **[@lacspace/chunk](https://developer.lacspace.com/packages/chunk)** — recursive / Markdown / code / sentence splitting. Inject `splitText` as `split`.
- **[@lacspace/embeddings](https://developer.lacspace.com/packages/embeddings)** — provider-agnostic `Embedder`. Inject as `embed`.
- **[@lacspace/vector](https://developer.lacspace.com/packages/vector)** — in-memory / pluggable vector store. Inject as `store`.
- **[@lacspace/ai](https://developer.lacspace.com/packages/ai)** & **[@lacspace/prompt](https://developer.lacspace.com/packages/prompt)** — wrap the assembled prompt into a chat call for `generate`.

Because every collaborator is duck-typed, any compatible embedder / store / splitter works just as well.

## Limitations

- **Not a vector database.** Persistence, indexing and similarity math live in the injected `store` — `@lacspace/rag` only orchestrates.
- **No built-in embedder or LLM.** By design: you inject them (keyless). Tests use deterministic fakes.
- **The built-in `simpleSplit` is a fallback**, not a smart splitter — it packs paragraphs and hard-windows oversized units with no offset tracking. Inject `@lacspace/chunk` for Markdown/code/sentence strategies and token-aware budgets.
- **`maxChars` trims by characters**, not tokens. For token budgets, render blocks yourself via a `template` measured with a tokenizer, or pre-trim chunks.
- **Metadata filtering is delegated** to the store; the filter shape you can use depends on the store implementation.
- **Chunk ids are derived** as `${docId}#${i}` when chunking; supply stable document `id`s if you re-index and rely on upsert replacing prior chunks.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/rag` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/rag
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
