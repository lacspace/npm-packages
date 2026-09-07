/**
 * Shared types for @lacspace/stream.
 */

/** A single parsed Server-Sent Events record. */
export interface SSEEvent {
  /** The `event:` field, if the record set one (e.g. Anthropic's `content_block_delta`). */
  event?: string;
  /** The `data:` payload. Multiple `data:` lines are joined with `\n`. */
  data: string;
  /** The `id:` field, if the record set one. */
  id?: string;
}

/** Anything `parseSSE` can read: a fetch body, an iterable of bytes/strings, or a raw string. */
export type ByteSource =
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array | string>
  | Iterable<Uint8Array | string>
  | string;

/** Alias — the input accepted by {@link parseSSE}. */
export type SSESource = ByteSource;

/** Supported streaming chat providers. */
export type Provider = "openai" | "anthropic";

export interface StreamChatOptions {
  provider: Provider;
}

/**
 * A normalized piece of a streaming chat response, unified across providers.
 * - `text`      — an incremental slice of assistant text.
 * - `tool_call` — an incremental slice of a tool/function call (id + name arrive
 *   once, `argsDelta` streams the JSON arguments in pieces).
 * - `done`      — the stream finished; `finishReason` when the provider gave one.
 */
export type ChatChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; index: number; id?: string; name?: string; argsDelta?: string }
  | { type: "done"; finishReason?: string };

/** A fully-assembled tool call (arguments concatenated into one JSON string). */
export interface ToolCall {
  index: number;
  id?: string;
  name?: string;
  /** The complete arguments JSON string (parse it with `JSON.parse`). */
  arguments: string;
}

/** The result of {@link accumulate} — the whole assistant turn, assembled. */
export interface AccumulatedChat {
  text: string;
  toolCalls: ToolCall[];
  finishReason?: string;
}

/**
 * Anything `streamChat` can read: a raw fetch `Response`, its `body`, an
 * iterable of bytes/strings, a string, or an already-parsed SSE iterable.
 */
export type ChatSource =
  | ByteSource
  | AsyncIterable<SSEEvent>
  | { body: ReadableStream<Uint8Array> | null };
