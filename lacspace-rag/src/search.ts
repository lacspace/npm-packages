/** Vector search and prompt assembly — pure, no network, no fs. */

import type { RagIndex, SearchHit, ChatMessage } from "./types.js";

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 * Returns 0 if either vector is empty, mismatched, or zero-length.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Rank the index chunks against `queryVector` by cosine similarity and return
 * the top `k` hits (default 4), highest score first.
 */
export function search(index: RagIndex, queryVector: number[], k = 4): SearchHit[] {
  const hits: SearchHit[] = index.chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryVector, chunk.vector),
  }));
  hits.sort((x, y) => y.score - x.score);
  return hits.slice(0, Math.max(0, Math.floor(k)));
}

export interface PromptOptions {
  /** Override the system instruction. */
  system?: string;
}

const DEFAULT_SYSTEM =
  "You are a helpful assistant. Answer the question using ONLY the context below. " +
  "If the context does not contain the answer, say you don't know based on the provided documents. " +
  "Cite the source paths you used.";

/**
 * Build a grounded chat prompt: a system instruction, the retrieved chunks as
 * numbered, source-labelled context, and the user's question.
 *
 * ```ts
 * buildPrompt("What port?", [{ chunk: {...}, score: 0.9 }]);
 * // [{ role: "system", ... }, { role: "user", content: "Context:\n[1] ..." }]
 * ```
 */
export function buildPrompt(
  question: string,
  hits: SearchHit[],
  opts: PromptOptions = {},
): ChatMessage[] {
  const context = hits
    .map((h, i) => `[${i + 1}] (source: ${h.chunk.source})\n${h.chunk.text}`)
    .join("\n\n");
  const body = context.length > 0 ? `Context:\n${context}\n\nQuestion: ${question}` : `Question: ${question}`;
  return [
    { role: "system", content: opts.system ?? DEFAULT_SYSTEM },
    { role: "user", content: body },
  ];
}
