/**
 * @lacspace/stream
 * A zero-dependency, isomorphic parser for Server-Sent Events and streaming LLM
 * responses. Turn a `fetch` streaming body into a clean async iterator of text
 * and tool-call deltas, normalized across OpenAI and Anthropic. No SDK, keyless.
 *
 * ```ts
 * import { streamChat, accumulate } from "@lacspace/stream";
 *
 * const res = await fetch("https://api.openai.com/v1/chat/completions", {
 *   method: "POST",
 *   headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
 *   body: JSON.stringify({ model, stream: true, messages }),
 * });
 *
 * for await (const chunk of streamChat(res, { provider: "openai" })) {
 *   if (chunk.type === "text") process.stdout.write(chunk.delta);
 * }
 * ```
 *
 * Zero dependencies · isomorphic (browser + Node ≥18 + edge) · fully typed.
 */

export { parseSSE, readableFromString, toAsyncIterable } from "./sse";
export { streamChat, accumulate } from "./chat";

// New in 1.1.0 — NDJSON / JSON-lines parsing.
export { parseNDJSON, parseJSONLines } from "./ndjson";
export type { NDJSONOptions } from "./ndjson";

// New in 1.1.0 — composable async-iterable transforms.
export {
  mapStream,
  filterStream,
  takeStream,
  bufferStream,
  tee,
} from "./transform";

// New in 1.1.0 — ReadableStream + AbortSignal adapters.
export { toReadableStream, withAbort, StreamAbortError } from "./adapters";

export type {
  SSEEvent,
  SSESource,
  ByteSource,
  Provider,
  StreamChatOptions,
  ChatChunk,
  ChatSource,
  ToolCall,
  AccumulatedChat,
} from "./types";
