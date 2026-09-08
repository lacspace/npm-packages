/**
 * lacspace-rag — a keyless, zero-dependency, local-first RAG toolkit.
 *
 * Index a folder of documents, then run semantic queries or ask grounded
 * questions. **Ollama is the default** — 100% free, fully local, no API key —
 * and any OpenAI-compatible endpoint works too. Every network call goes through
 * an injectable `fetchImpl`, so the whole library is testable without a server.
 *
 * ```ts
 * import { chunkText, embed, chat, search, buildPrompt, createIndex, addToIndex } from "lacspace-rag";
 *
 * // 1. chunk + embed your docs (Ollama, default)
 * const parts = chunkText(readmeText, { size: 800, overlap: 100 });
 * const vectors = await embed(parts, { model: "nomic-embed-text" });
 *
 * // 2. build an index
 * const index = createIndex("ollama", "nomic-embed-text");
 * addToIndex(index, parts.map((text, i) => ({ id: `readme#${i}`, text, source: "README.md", vector: vectors[i]! })));
 *
 * // 3. retrieve + answer
 * const [q] = await embed(["How do I install it?"]);
 * const hits = search(index, q!, 4);
 * const answer = await chat(buildPrompt("How do I install it?", hits), { model: "llama3.2" });
 * ```
 *
 * No API key is read inside the library — the CLI layer resolves keys from the
 * environment and passes them in explicitly.
 */

// --- types ---
export { RagError } from "./types.js";
export type {
  Provider,
  ChatMessage,
  RagChunk,
  RagIndex,
  SearchHit,
  FetchImpl,
} from "./types.js";

// --- chunking ---
export { chunkText } from "./chunk.js";
export type { ChunkOptions } from "./chunk.js";

// --- search / prompt (pure) ---
export { cosineSimilarity, search, buildPrompt } from "./search.js";
export type { PromptOptions } from "./search.js";

// --- providers (embeddings + chat) ---
export { embed, embedOne, chat } from "./provider.js";
export type {
  ProviderOptions,
  EmbedOptions,
  ChatOptions,
} from "./provider.js";

// --- index build + persistence ---
export {
  createIndex,
  addToIndex,
  walkFiles,
  readTextFile,
  saveIndex,
  loadIndex,
  DEFAULT_EXTENSIONS,
  DEFAULT_IGNORE_DIRS,
} from "./store.js";
export type {
  AddChunkInput,
  WalkOptions,
  WalkedFile,
} from "./store.js";
