/**
 * Newline-delimited JSON (NDJSON / JSON-lines) stream parsing. Zero-dependency,
 * isomorphic — the same byte-buffering discipline as {@link parseSSE}, but each
 * complete line is `JSON.parse`d instead of framed as an SSE record.
 */

import { toAsyncIterable } from "./sse";
import type { ByteSource } from "./types";

/** Options for {@link parseNDJSON}. */
export interface NDJSONOptions {
  /**
   * What to do when a line is not valid JSON:
   * - `"throw"` (default) — rethrow the `SyntaxError`.
   * - `"skip"` — silently ignore the malformed line.
   */
  onError?: "throw" | "skip";
}

/**
 * Parse a newline-delimited JSON stream into an async iterable of parsed values.
 * Buffers across chunk boundaries and decodes UTF-8, so a value — or a multi-byte
 * code point — split across two `fetch` chunks is reassembled correctly. Blank
 * lines are skipped; both `\n` and `\r\n` line endings are accepted.
 *
 * ```ts
 * for await (const row of parseNDJSON<{ id: number }>(response.body!)) {
 *   console.log(row.id);
 * }
 * ```
 */
export async function* parseNDJSON<T = unknown>(
  source: ByteSource,
  opts: NDJSONOptions = {},
): AsyncIterable<T> {
  const onError = opts.onError ?? "throw";
  const chunks = toAsyncIterable<Uint8Array | string>(source);
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const emit = function* (raw: string): Iterable<T> {
    let line = raw;
    if (line.charCodeAt(line.length - 1) === 13 /* "\r" */) {
      line = line.slice(0, -1);
    }
    if (line.trim() === "") return;
    try {
      yield JSON.parse(line) as T;
    } catch (err) {
      if (onError === "throw") throw err;
    }
  };

  for await (const chunk of chunks) {
    buffer +=
      typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      yield* emit(line);
    }
  }

  // Flush any bytes still held by the decoder, then the final line.
  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (buffer.length) yield* emit(buffer);
}

/** Alias for {@link parseNDJSON} — the "JSON Lines" name for the same format. */
export const parseJSONLines = parseNDJSON;
