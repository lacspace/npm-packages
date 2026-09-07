<div align="center">

# @lacspace/ai

**One `chat()` for every LLM — OpenAI, Anthropic, Gemini and any OpenAI-compatible endpoint. Zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/ai?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/ai)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/ai?label=minzip)](https://bundlephobia.com/package/@lacspace/ai)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/ai)
[![license](https://img.shields.io/npm/l/@lacspace/ai?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A tiny, **provider-agnostic** chat client built on `fetch`. Talk to OpenAI, Anthropic (Claude), Google Gemini and any OpenAI-compatible endpoint (Groq, Together, OpenRouter, Ollama, LocalAI…) through **one unified API** — non-streaming, streaming, and tool-calling — with responses normalized to a single shape. Bring your own key. No SDK, no lock-in, isomorphic, fully typed.

- 🔌 **Four providers, one call** — `chat({ provider, model, apiKey, messages })`. Switch vendors by changing a string.
- 🌊 **Streaming** — `stream()` yields unified `ChatChunk`s; `accumulate()` folds them back to `{ text, toolCalls }`.
- 🛠️ **Tool calling** — describe tools once with JSON Schema; translated to each provider's format and normalized on the way back.
- 📦 **Normalized responses** — `{ text, toolCalls, finishReason, usage, model, raw }`, identical across providers.
- 🌍 **Zero dependencies · isomorphic** — Node 18+, browser, edge, serverless. Only Web-standard `fetch` / `ReadableStream`.

> ⚠️ **Network + key required.** This package makes real HTTP calls to the provider you choose. You supply the API key. Nothing is bundled or proxied — your key goes straight to the provider.

## Install

```bash
npm i @lacspace/ai
```

## Quickstart

```ts
import { chat } from "@lacspace/ai";

const res = await chat({
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
  messages: [
    { role: "system", content: "You are terse." },
    { role: "user", content: "Say hi in one word." },
  ],
});

console.log(res.text);          // "Hi"
console.log(res.usage);         // { inputTokens: 18, outputTokens: 1 }
console.log(res.finishReason);  // "stop"
```

The **same `chat()` call** works for every provider — only `provider`, `model`, `apiKey` change:

```ts
// Anthropic (Claude)
await chat({ provider: "anthropic", model: "claude-3-5-sonnet-latest", apiKey: ANTHROPIC_KEY, messages });

// Google Gemini
await chat({ provider: "google", model: "gemini-1.5-flash", apiKey: GEMINI_KEY, messages });

// Groq (OpenAI-compatible)
await chat({ provider: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant", apiKey: GROQ_KEY, messages });

// Ollama, running locally (no key)
await chat({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "llama3", messages });
```

## Streaming

```ts
import { stream, accumulate } from "@lacspace/ai";

const chunks = stream({
  provider: "anthropic",
  model: "claude-3-5-sonnet-latest",
  apiKey: ANTHROPIC_KEY,
  messages: [{ role: "user", content: "Write a haiku about the sea." }],
});

for await (const chunk of chunks) {
  if (chunk.type === "text") process.stdout.write(chunk.delta);
  if (chunk.type === "done") console.log("\n", chunk.usage);
}
```

Need the final result instead of a live feed? `accumulate()` folds the whole stream — reconstructing tool-call fragments too:

```ts
const final = await accumulate(
  stream({ provider: "openai", model: "gpt-4o", apiKey, messages }),
);
// { text, toolCalls, finishReason, usage }
```

## Bind a client once

```ts
import { createClient } from "@lacspace/ai";

const ai = createClient({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: "gpt-4o-mini",
});

await ai.chat({ messages: [{ role: "user", content: "Hi" }] });
await ai.chat({ model: "gpt-4o", messages });        // per-call override
for await (const c of ai.stream({ messages })) { /* … */ }
```

## Tool calling

Describe tools once with JSON Schema; `@lacspace/ai` translates them to each provider's format and normalizes the calls back:

```ts
const res = await chat({
  provider: "openai",
  model: "gpt-4o",
  apiKey,
  messages: [{ role: "user", content: "What's the weather in NYC?" }],
  tools: [
    {
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  ],
});

if (res.finishReason === "tool_calls") {
  for (const call of res.toolCalls) {
    console.log(call.name, call.args); // "get_weather" { city: "NYC" }
    const result = await getWeather(call.args.city as string);

    // Feed the result back for a final answer
    const followUp = await chat({
      provider: "openai",
      model: "gpt-4o",
      apiKey,
      messages: [
        { role: "user", content: "What's the weather in NYC?" },
        { role: "assistant", content: "", toolCalls: res.toolCalls },
        { role: "tool", toolCallId: call.id, content: JSON.stringify(result) },
      ],
    });
    console.log(followUp.text);
  }
}
```

## API

| Export | Signature | What it does |
| --- | --- | --- |
| `chat` | `(opts: ChatOptions) => Promise<ChatResponse>` | One non-streaming completion, normalized. |
| `stream` | `(opts: ChatOptions) => AsyncGenerator<ChatChunk>` | Streaming completion as unified chunks. |
| `accumulate` | `(chunks) => Promise<{ text, toolCalls, finishReason?, usage? }>` | Fold a chunk stream into the final result. |
| `createClient` | `(config: ClientConfig) => AiClient` | Bind provider/key/model; call with just `messages`. |
| `AiError` | `class extends Error` | Thrown on non-2xx / network errors. Has `.status`, `.provider`, `.raw`. |

**`ChatOptions`** — `{ provider, model, apiKey?, messages, tools?, temperature?, maxTokens?, topP?, stop?, baseUrl?, headers?, signal? }`
where `provider ∈ "openai" | "anthropic" | "google" | "openai-compatible"`.

**`Message`** — `{ role: "system" | "user" | "assistant" | "tool", content: string | Part[], toolCalls?, toolCallId?, name? }`.

**`ChatResponse`** — `{ text, toolCalls: ToolCall[], finishReason, usage?: { inputTokens, outputTokens }, model, raw }`.

**`ChatChunk`** — `{ type: "text", delta }` | `{ type: "tool_call", index, id?, name?, argsDelta? }` | `{ type: "done", finishReason?, usage? }`.

**`FinishReason`** — normalized to `"stop" | "length" | "tool_calls" | "content_filter" | "error" | "other" | null` across every provider.

## Supported providers

| `provider` | Endpoint | Auth | System prompt |
| --- | --- | --- | --- |
| `openai` | `api.openai.com/v1/chat/completions` | `Authorization: Bearer` | `system` role message |
| `anthropic` | `api.anthropic.com/v1/messages` | `x-api-key` + `anthropic-version` | top-level `system` |
| `google` | `…/v1beta/models/{model}:generateContent?key=` | `?key=` query | `systemInstruction` |
| `openai-compatible` | your `baseUrl` + `/chat/completions` | `Authorization: Bearer` (optional) | `system` role message |

**`openai-compatible`** covers **Groq, Together, OpenRouter, Ollama, LocalAI, vLLM, LM Studio** and anything else that speaks the OpenAI Chat Completions shape — just set `baseUrl`.

## How it works

There's no magic and no bundled model. For each call `@lacspace/ai`:

1. Picks the provider adapter and builds the **correct URL, headers and request body** (mapping your messages, tools and params into that vendor's schema — e.g. Anthropic's top-level `system` and required `max_tokens`, Google's `systemInstruction` + `contents`).
2. POSTs it with the global `fetch`.
3. Normalizes the reply into one `ChatResponse` shape — and for streaming, parses the provider's SSE (Server-Sent Events) into unified `ChatChunk`s with an inlined, dependency-free parser.

Non-2xx responses throw an `AiError` carrying the HTTP status and the provider's own error message.

## Honest limitations

- **It's a thin client, not an agent framework.** No built-in agent loop, retries, rate-limit backoff, prompt templating, memory, RAG or provider fallback. Compose those yourself — the primitives are small on purpose.
- **You bring the key and the network.** Every call is a real request to the provider. Keep keys server-side in the browser/edge.
- **Provider parity isn't total.** Params/features unique to one vendor (JSON mode, seeds, caching headers, thinking budgets, multi-part image nuances) aren't all abstracted — reach for `headers` and read `res.raw` when you need the exact upstream payload.
- **`maxTokens` defaults to 1024 for Anthropic** (its API requires it); other providers use their own defaults unless you set it.
- **No token counting or cost math** — `usage` is passed through verbatim when the provider returns it.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/ai` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/ai
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
