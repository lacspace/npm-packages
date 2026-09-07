/**
 * Normalize provider streaming chat completions into one unified stream of
 * {@link ChatChunk}s, and assemble them back into a final result.
 */

import { parseSSE } from "./sse";
import type {
  AccumulatedChat,
  ChatChunk,
  ChatSource,
  SSEEvent,
  StreamChatOptions,
  ToolCall,
} from "./types";

function isReadableStream(x: any): x is ReadableStream<Uint8Array> {
  return !!x && typeof x.getReader === "function";
}

function isSSEEvent(x: any): x is SSEEvent {
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.data === "string" &&
    !(x instanceof Uint8Array)
  );
}

function safeJSON(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/**
 * Turn any accepted `ChatSource` into an async iterable of {@link SSEEvent}.
 * Unwraps a `Response`, reads a `ReadableStream`, and — for an async iterable —
 * peeks the first value to decide whether it is already SSE events or raw bytes.
 */
async function* toSSEEvents(source: ChatSource): AsyncIterable<SSEEvent> {
  let src: any = source;

  // Unwrap a fetch Response → its body.
  if (
    src &&
    typeof src === "object" &&
    !isReadableStream(src) &&
    src.body &&
    isReadableStream(src.body)
  ) {
    src = src.body;
  }

  if (typeof src === "string" || isReadableStream(src)) {
    yield* parseSSE(src);
    return;
  }

  // An async or sync iterable — peek the first item to detect its element type.
  const getAsync = src?.[Symbol.asyncIterator];
  const getSync = src?.[Symbol.iterator];
  if (typeof getAsync !== "function" && typeof getSync !== "function") {
    throw new TypeError("streamChat: unsupported source");
  }

  if (typeof getAsync === "function") {
    const it: AsyncIterator<any> = getAsync.call(src);
    const first = await it.next();
    if (first.done) return;
    if (isSSEEvent(first.value)) {
      yield first.value;
      for (;;) {
        const n = await it.next();
        if (n.done) return;
        yield n.value;
      }
    }
    // Raw bytes/strings — re-chain and hand to parseSSE.
    yield* parseSSE(prependAsync(first.value, it));
    return;
  }

  // Sync iterable.
  const it: Iterator<any> = getSync!.call(src);
  const first = it.next();
  if (first.done) return;
  if (isSSEEvent(first.value)) {
    yield first.value;
    for (;;) {
      const n = it.next();
      if (n.done) return;
      yield n.value;
    }
  }
  yield* parseSSE(prependSync(first.value, it));
}

function prependAsync<T>(first: T, rest: AsyncIterator<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield first;
      for (;;) {
        const n = await rest.next();
        if (n.done) return;
        yield n.value;
      }
    },
  };
}

function prependSync<T>(first: T, rest: Iterator<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield first;
      for (;;) {
        const n = rest.next();
        if (n.done) return;
        yield n.value;
      }
    },
  };
}

/** Normalize one OpenAI SSE record into zero or more {@link ChatChunk}s. */
function* fromOpenAI(ev: SSEEvent): Iterable<ChatChunk> {
  if (ev.data === "[DONE]") return;
  const json = safeJSON(ev.data);
  const choice = json?.choices?.[0];
  if (!choice) return;

  const delta = choice.delta ?? {};

  if (typeof delta.content === "string" && delta.content.length > 0) {
    yield { type: "text", delta: delta.content };
  }

  if (Array.isArray(delta.tool_calls)) {
    for (const tc of delta.tool_calls) {
      const chunk: ChatChunk = {
        type: "tool_call",
        index: typeof tc?.index === "number" ? tc.index : 0,
      };
      if (tc?.id != null) chunk.id = tc.id;
      if (tc?.function?.name != null) chunk.name = tc.function.name;
      if (tc?.function?.arguments != null) chunk.argsDelta = tc.function.arguments;
      yield chunk;
    }
  }

  if (choice.finish_reason != null) {
    yield { type: "done", finishReason: choice.finish_reason };
  }
}

/**
 * Parse a provider's streaming chat completion into a single, unified stream of
 * {@link ChatChunk}. Accepts a raw fetch `Response`, its `body`, an iterable of
 * bytes/strings, a string, or an already-parsed SSE iterable.
 *
 * ```ts
 * const res = await fetch(url, { ... });          // stream: true
 * for await (const c of streamChat(res, { provider: "openai" })) {
 *   if (c.type === "text") process.stdout.write(c.delta);
 * }
 * ```
 */
export async function* streamChat(
  source: ChatSource,
  opts: StreamChatOptions,
): AsyncIterable<ChatChunk> {
  const events = toSSEEvents(source);

  if (opts.provider === "anthropic") {
    let stopReason: string | undefined;
    for await (const ev of events) {
      const t = safeJSON(ev.data);
      if (!t || typeof t.type !== "string") continue;

      switch (t.type) {
        case "content_block_start": {
          const cb = t.content_block;
          if (cb?.type === "tool_use") {
            const chunk: ChatChunk = {
              type: "tool_call",
              index: typeof t.index === "number" ? t.index : 0,
            };
            if (cb.id != null) chunk.id = cb.id;
            if (cb.name != null) chunk.name = cb.name;
            yield chunk;
          }
          break;
        }
        case "content_block_delta": {
          const d = t.delta;
          if (d?.type === "text_delta" && typeof d.text === "string") {
            yield { type: "text", delta: d.text };
          } else if (
            d?.type === "input_json_delta" &&
            typeof d.partial_json === "string"
          ) {
            yield {
              type: "tool_call",
              index: typeof t.index === "number" ? t.index : 0,
              argsDelta: d.partial_json,
            };
          }
          break;
        }
        case "message_delta": {
          if (t.delta?.stop_reason != null) stopReason = t.delta.stop_reason;
          break;
        }
        case "message_stop": {
          yield stopReason != null
            ? { type: "done", finishReason: stopReason }
            : { type: "done" };
          break;
        }
        default:
          break;
      }
    }
    return;
  }

  // OpenAI (default).
  for await (const ev of events) {
    yield* fromOpenAI(ev);
  }
}

/**
 * Consume a {@link streamChat} iterable and assemble the final assistant turn:
 * the full text, the complete tool calls (argument deltas concatenated into one
 * JSON string), and the finish reason if the provider gave one.
 *
 * ```ts
 * const { text, toolCalls } = await accumulate(
 *   streamChat(res, { provider: "anthropic" }),
 * );
 * ```
 */
export async function accumulate(
  chunks: AsyncIterable<ChatChunk>,
): Promise<AccumulatedChat> {
  let text = "";
  let finishReason: string | undefined;
  const byIndex = new Map<
    number,
    { id?: string; name?: string; args: string }
  >();

  for await (const c of chunks) {
    if (c.type === "text") {
      text += c.delta;
    } else if (c.type === "tool_call") {
      let entry = byIndex.get(c.index);
      if (!entry) {
        entry = { args: "" };
        byIndex.set(c.index, entry);
      }
      if (c.id != null) entry.id = c.id;
      if (c.name != null) entry.name = c.name;
      if (c.argsDelta != null) entry.args += c.argsDelta;
    } else if (c.type === "done") {
      if (c.finishReason != null) finishReason = c.finishReason;
    }
  }

  const toolCalls: ToolCall[] = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, e]) => {
      const tc: ToolCall = { index, arguments: e.args };
      if (e.id != null) tc.id = e.id;
      if (e.name != null) tc.name = e.name;
      return tc;
    });

  const result: AccumulatedChat = { text, toolCalls };
  if (finishReason != null) result.finishReason = finishReason;
  return result;
}
