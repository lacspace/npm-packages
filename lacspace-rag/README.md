# lacspace-rag

**Keyless, local-first RAG in one CLI.** Point it at a folder of docs, and it chunks them, embeds every piece, and stores a tiny JSON index. Then `query` finds the most relevant passages and `ask` gives you a grounded answer with sources. **Ollama is the default — 100% free, fully local, no API key, no account, no cloud.** Any OpenAI-compatible endpoint works too. Zero runtime dependencies — the chunker, cosine search, index format and provider calls are all hand-written.

```bash
# 1. free local models (once)
ollama pull nomic-embed-text        # embeddings
ollama pull llama3.2                # chat

# 2. index a folder, then ask it questions
npx lacspace-rag index ./docs
npx lacspace-rag ask "how do I configure the port?"
```

Everything runs on your machine. Your documents never leave it.

## Why it exists

RAG has become a wall of SDKs, API keys and vector-DB services for what is, at its core, four small ideas: chunk your text, embed the chunks, cosine-search them against a question, and hand the top hits to a model as grounded context. `lacspace-rag` is exactly that — no key, no server to stand up, no dependency tree — with **Ollama as the free default** so you can run a complete local RAG pipeline with a single `npx`. It's the self-contained cousin of the `@lacspace` AI App Kit.

## Install

```bash
# one-off, no install
npx lacspace-rag index ./docs

# or globally
npm i -g lacspace-rag

# or as a library
npm i lacspace-rag
```

Requires **Node ≥ 20** (for global `fetch`). For the free default path you also need [Ollama](https://ollama.com) running locally.

## The three commands

```
lacspace-rag index <path>          walk, chunk, embed, save an index
lacspace-rag query "<question>"    print the top-k matching chunks + scores
lacspace-rag ask "<question>"      answer the question, grounded, with sources
```

### `index`

```bash
lacspace-rag index ./docs
# ◆ lacspace-rag index · 12 files
#   ✓ README.md · 3 chunks
#   ✓ guide/setup.md · 5 chunks
#   ...
# ✓ indexed · 84 chunks · dim 768 · nomic-embed-text
#   saved to ./.lacspace-rag/index.json
```

Recursively reads text files (`.txt`, `.md`, `.mdx`, and common code/config extensions), skips `node_modules`, `.git`, `dist`, binaries and oversized files, chunks each to ~800 chars with ~100 overlap, embeds every chunk, and writes `./.lacspace-rag/index.json`.

### `query`

```bash
lacspace-rag query "how do I change the listening port?" -k 4
# [1] 0.8123  guide/setup.md
#     Set the port with the PORT env var or the `port` field in config.json …
```

Embeds the question, cosine-searches the index, and prints the top-k chunks with scores and source paths. No model call — pure retrieval.

### `ask`

```bash
lacspace-rag ask "what's the install command and default port?"
# ◆ lacspace-rag ask
#
# Install it with `npm i -g lacspace-rag`. The server listens on port 8080 by default.
#
# Sources
#   • README.md
#   • guide/setup.md
```

Retrieves, builds a grounded prompt (system instruction + numbered, source-labelled context + your question), calls the chat model, and prints the answer followed by the sources it drew from.

## Providers & flags

**Ollama (default — free, local, keyless):**

```bash
lacspace-rag ask "..."                       # uses llama3.2 + nomic-embed-text on localhost:11434
```

**OpenAI-compatible (bring a key):**

```bash
export OPENAI_API_KEY=sk-...
lacspace-rag ask "..." --provider openai --model gpt-4o-mini --embed-model text-embedding-3-small
```

| Flag | Description |
| --- | --- |
| `--provider <p>` | `ollama` (default) or `openai` (any OpenAI-compatible API) |
| `--base-url <url>` | API base URL (default `http://localhost:11434`) |
| `--model <name>` | Chat model (default `llama3.2`) |
| `--embed-model <name>` | Embedding model (default `nomic-embed-text`) |
| `--api-key <key>` | Key for OpenAI-compatible providers — or set `LACSPACE_RAG_API_KEY` / `OPENAI_API_KEY` |
| `-i, --index <file>` | Index file (default `./.lacspace-rag/index.json`) |
| `-k, --k <n>` | Number of chunks to retrieve (default `4`) |
| `--size <n>` | Chunk size in characters (default `800`, `index` only) |
| `--overlap <n>` | Chunk overlap in characters (default `100`, `index` only) |
| `--json` | Machine-readable JSON output |
| `-h, --help` / `-v, --version` | Help / version |

The API key is read **only** in the CLI layer (flag or env) and passed explicitly into the library — the library itself never touches your environment. Answers/data go to **stdout**, progress and errors to **stderr**, and a failure exits **non-zero** so it drops into scripts and CI.

## Library API

Every network call goes through an injectable `fetchImpl` (default: global `fetch`), so the core is fully testable without a server.

```ts
import {
  chunkText, embed, embedOne, chat,
  cosineSimilarity, search, buildPrompt,
  createIndex, addToIndex, walkFiles, saveIndex, loadIndex,
} from "lacspace-rag";

const parts   = chunkText(text, { size: 800, overlap: 100 });
const vectors = await embed(parts, { model: "nomic-embed-text" });     // Ollama by default

const index = createIndex("ollama", "nomic-embed-text");
addToIndex(index, parts.map((t, i) => ({ id: `doc#${i}`, text: t, source: "doc.md", vector: vectors[i]! })));

const [q]   = await embed(["How do I install it?"]);
const hits  = search(index, q!, 4);
const answer = await chat(buildPrompt("How do I install it?", hits), { model: "llama3.2" });
```

| Export | Signature |
| --- | --- |
| `chunkText` | `(text, { size?, overlap? }) => string[]` — overlapping, boundary-aware chunks |
| `embed` | `(texts[], opts?) => Promise<number[][]>` — one vector per text (Ollama/OpenAI) |
| `embedOne` | `(text, opts?) => Promise<number[]>` |
| `chat` | `(messages, opts?) => Promise<string>` — grounded chat completion |
| `cosineSimilarity` | `(a[], b[]) => number` in `[-1, 1]` |
| `search` | `(index, queryVector, k?) => SearchHit[]` — ranked top-k |
| `buildPrompt` | `(question, hits, { system? }) => ChatMessage[]` |
| `createIndex` / `addToIndex` | `(provider, embedModel)` / `(index, chunks[])` — pure index building |
| `walkFiles` | `(dir, opts?) => WalkedFile[]` — recursive text-file discovery |
| `saveIndex` / `loadIndex` | JSON index persistence (with validation) |

All network options (`EmbedOptions`, `ChatOptions`) accept `{ provider, baseUrl, model, apiKey, fetchImpl }`. Types (`RagIndex`, `RagChunk`, `SearchHit`, `ChatMessage`, `Provider`, `RagError`, …) are exported too. Fully typed, dual ESM + CJS.

## Limitations (honest)

- **Retrieval is brute-force cosine** over an in-memory JSON index — perfect up to tens of thousands of chunks, but it's not a sharded vector database. There's no ANN index, quantization, or on-disk memory-mapping.
- **The index is provider/model-specific.** Vectors are only comparable within the same embedding model, so re-index if you switch `--embed-model` or `--provider`.
- **`index` re-embeds from scratch** each run — there's no incremental / changed-files-only update yet.
- **Ollama embeddings are one request per chunk** (its `/api/embeddings` is single-prompt); OpenAI batches in one call. Large folders take a while on the first index.
- **Chunking is character-based** (boundary-aware), not token-based, so a chunk can exceed a model's token budget for very dense text — lower `--size` if so.
- **No re-ranking, query expansion, or citation-span highlighting** — retrieval is single-shot top-k. Answer quality tracks the local model you run.
- Text extraction is **plain-text only** — it reads source/markdown/config files, not PDFs, DOCX, or images (pair it with `lacspace-extract` for those).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, permissive, Lacspace-branded.

---

Part of the free [Lacspace developer tools](https://developer.lacspace.com/tools). Built keyless, local-first and zero-dependency.
