/**
 * Streaming text helper.
 *
 * `stream()` yields rich {@link ChatChunk}s (text, tool-call fragments, done).
 * When you only care about the assistant's prose — to print tokens as they
 * arrive — `textStream()` filters the stream down to just the text deltas.
 *
 * ```ts
 * import { stream, textStream } from "@lacspace/ai";
 * for await (const token of textStream(stream(opts))) process.stdout.write(token);
 * ```
 */

import type { ChatChunk } from "./types.js";

/** Yield only the non-empty text deltas of a {@link ChatChunk} stream. */
export async function* textStream(
  chunks: Iterable<ChatChunk> | AsyncIterable<ChatChunk>,
): AsyncGenerator<string, void, unknown> {
  for await (const chunk of chunks as AsyncIterable<ChatChunk>) {
    if (chunk.type === "text" && chunk.delta) yield chunk.delta;
  }
}
