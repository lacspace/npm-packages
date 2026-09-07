<div align="center">

# @lacspace/stream

**Parse Server-Sent Events and streaming LLM responses into a clean async iterator — zero dependencies, no SDK.**

[![npm version](https://img.shields.io/npm/v/@lacspace/stream?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/stream)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/stream?label=minzip)](https://bundlephobia.com/package/@lacspace/stream)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/stream)
[![license](https://img.shields.io/npm/l/@lacspace/stream?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Turn a `fetch` streaming body into `for await (const chunk of …)` — SSE framing, UTF-8 buffering across chunk boundaries, and provider normalization for OpenAI **and** Anthropic, all in one tiny isomorphic package. Bring your own API key; no SDK, no dependencies.

- 🔌 **`parseSSE`** — a correct SSE parser: multi-line `data:`, `event:`, `id:`, comments, chunk-boundary buffering, `[DONE]` sentinel
- 🤝 **`streamChat`** — one unified stream of `text` / `tool_call` / `done` deltas, normalized across **OpenAI** and **Anthropic**
- 🧵 **`accumulate`** — collapse the stream back into final text + complete tool-call JSON
- 🌍 Zero dependencies · isomorphic (browser + Node ≥18 + edge/serverless) · fully typed

## Install

```bash
npm i @lacspace/stream
```

## Stream a chat completion (OpenAI)

```ts
import { streamChat } from "@lacspace/stream";

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "gpt-4o-mini", stream: true, messages }),
});

for await (const chunk of streamChat(res, { provider: "openai" })) {
  if (chunk.type === "text") process.stdout.write(chunk.delta);
  else if (chunk.type === "tool_call") console.log("\ntool:", chunk.name ?? chunk.argsDelta);
  else if (chunk.type === "done") console.log("\n[done]", chunk.finishReason);
}
```

The **same loop** works for Anthropic — just pass `{ provider: "anthropic" }` and point `fetch` at the Messages API. `message_start` / `content_block_delta` / `message_stop` events are all normalized into the identical `ChatChunk` shape.

## Get the final answer in one call

```ts
import { streamChat, accumulate } from "@lacspace/stream";

const { text, toolCalls, finishReason } = await accumulate(
  streamChat(res, { provider: "anthropic" }),
);

// text        → "The weather in Paris is sunny."
// toolCalls   → [{ index: 1, id: "toolu_…", name: "get_weather", arguments: '{"location":"Paris"}' }]
// finishReason→ "tool_use"

const args = JSON.parse(toolCalls[0].arguments); // { location: "Paris" }
```

Argument deltas are concatenated for you into one valid JSON string per tool call, keyed by index — so parallel tool calls stay separate.

## Just parse raw SSE

`parseSSE` is provider-agnostic — use it for any `text/event-stream` endpoint (LLMs, live dashboards, progress feeds):

```ts
import { parseSSE } from "@lacspace/stream";

for await (const ev of parseSSE(response.body!)) {
  // ev = { event?: string, data: string, id?: string }
  if (ev.event === "ping") continue;
  const payload = JSON.parse(ev.data);
}
```

It correctly handles multi-line `data:`, comment lines (`:`), chunk boundaries that split a field — or even a multi-byte UTF-8 character — mid-way, and stops the iteration when it sees `data: [DONE]`.

## Test without a network

`readableFromString` builds a real `ReadableStream` from a canned string (with an optional chunk size to force boundary splits), so you can unit-test streaming code with no mocking of `fetch`:

```ts
import { streamChat, accumulate, readableFromString } from "@lacspace/stream";

const canned =
  'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  "data: [DONE]\n\n";

const { text } = await accumulate(
  streamChat(readableFromString(canned, 4), { provider: "openai" }),
);
// text === "Hi"
```

## Flexible input

Every entry point accepts more than a `Response`:

```ts
streamChat(response, { provider: "openai" });        // a fetch Response
streamChat(response.body!, { provider: "openai" });  // its ReadableStream
streamChat(parseSSE(response.body!), { provider }); // an already-parsed SSE iterable
parseSSE("data: a\n\ndata: b\n\n");                  // a raw string
parseSSE(asyncIterableOfUint8ArrayOrString);         // any byte/string source
```

## API

| Export | Signature | Description |
| --- | --- | --- |
| `parseSSE` | `(source) => AsyncIterable<SSEEvent>` | Parse an SSE stream into `{ event?, data, id? }` records. `source` = `ReadableStream` \| async/sync iterable of `Uint8Array`\|`string` \| `string`. Ends on `data: [DONE]`. |
| `streamChat` | `(source, { provider }) => AsyncIterable<ChatChunk>` | Normalize an OpenAI or Anthropic streaming completion. `source` also accepts a `Response`, its `body`, or an already-parsed SSE iterable. |
| `accumulate` | `(chunks) => Promise<{ text, toolCalls, finishReason? }>` | Consume a `streamChat` iterable and assemble the final result. |
| `readableFromString` | `(str, chunkSize?) => ReadableStream<Uint8Array>` | Build a stream from a string — handy for tests and boundary fuzzing. |
| `toAsyncIterable` | `(stream) => AsyncIterable<T>` | Coerce a `ReadableStream` / iterable / string into an async iterable (browser-safe reader fallback). |

**Types**

```ts
interface SSEEvent { event?: string; data: string; id?: string }

type ChatChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; index: number; id?: string; name?: string; argsDelta?: string }
  | { type: "done"; finishReason?: string };

interface ToolCall { index: number; id?: string; name?: string; arguments: string }
interface AccumulatedChat { text: string; toolCalls: ToolCall[]; finishReason?: string }
```

## How it works

- **SSE framing** follows the WHATWG `EventSource` rules: fields split on the first `:`, one leading space stripped from the value, multiple `data:` lines joined with `\n`, comment lines (`:`) ignored, and a blank line dispatches the record.
- **Chunk buffering** keeps a rolling string buffer and only emits complete lines, so a field — or a multi-byte UTF-8 code point — split across two `fetch` chunks is reassembled correctly (`TextDecoder({ stream: true })`).
- **Provider mapping**: OpenAI's `choices[0].delta.content` / `delta.tool_calls[]` / `finish_reason`, and Anthropic's `content_block_start` (tool id + name), `content_block_delta` (`text_delta` / `input_json_delta`), and `message_delta` / `message_stop`, all collapse into the one `ChatChunk` union.

## Limitations

- **Parsing only** — this library does not make the API request or hold your key. You call `fetch` (with `stream: true` for OpenAI, or the SSE `Accept` header for Anthropic) and hand the body to `streamChat`.
- **Two providers normalized** — OpenAI and Anthropic. Other vendors that emit OpenAI-compatible SSE (many do) work with `provider: "openai"`; anything else you can parse yourself with `parseSSE` and map the JSON.
- `accumulate` concatenates argument deltas verbatim — a stream that was truncated mid-tool-call yields an incomplete (unparseable) JSON string, by design; check `finishReason` before trusting it.
- Non-content events (usage/ping/`message_start`) are intentionally dropped from the unified stream; use `parseSSE` directly if you need them.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/stream` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/stream
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
