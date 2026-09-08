/** Shared types for lacspace-rag. */

export type Provider = "ollama" | "openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A single embedded slice of a document. */
export interface RagChunk {
  /** Stable id (source path + chunk ordinal). */
  id: string;
  /** The chunk text. */
  text: string;
  /** Source file path (or logical name) the chunk came from. */
  source: string;
  /** Embedding vector. */
  vector: number[];
}

/** The on-disk index: a flat list of embedded chunks plus a little metadata. */
export interface RagIndex {
  /** Index file format version. */
  version: 1;
  /** Provider the vectors were produced with. */
  provider: Provider;
  /** Embedding model used (vectors are only comparable within one model). */
  embedModel: string;
  /** Vector dimension (0 until the first chunk is added). */
  dimension: number;
  /** ISO timestamp of the last write. */
  updatedAt: string;
  /** Embedded chunks. */
  chunks: RagChunk[];
}

/** A search hit: a chunk plus its similarity score. */
export interface SearchHit {
  chunk: RagChunk;
  score: number;
}

/** The `fetch` implementation used for all network calls (injectable for tests). */
export type FetchImpl = typeof fetch;

/** A network / provider error carrying a machine code the CLI can act on. */
export class RagError extends Error {
  code: "connection" | "http" | "shape" | "empty" | "config";
  constructor(message: string, code: RagError["code"]) {
    super(message);
    this.name = "RagError";
    this.code = code;
  }
}
