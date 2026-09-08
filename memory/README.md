<div align="center">

# @lacspace/memory

**Keyless conversation memory for LLM chat apps — history, token budgets and optional summarization. Zero dependencies, isomorphic, fully typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/memory?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/memory)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/memory?label=minzip)](https://bundlephobia.com/package/@lacspace/memory)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/memory)
[![license](https://img.shields.io/npm/l/@lacspace/memory?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A chat app's context window is finite, but the conversation isn't. `@lacspace/memory` tracks the message history, keeps a **sliding window** inside a token/message budget, and — when you give it a summarizer — folds old turns into a single note instead of forgetting them. Token counting and summarization are **injected**, so there is **no hard dependency** on a tokenizer or an LLM, and **no API key** ever lives here.

- 🧠 **Conversation memory** — `add` / `addUser` / `addAssistant` / `addTool`, `messages()` (the window), `history()` (everything)
- 📐 **Budget-aware** — cap by `maxMessages` and/or `maxTokens`; the oldest non-system turns drop first
- 🗜️ **Optional summarization** — inject a `summarize()` and `prune()` replaces overflow with one summary note (BYO LLM = keyless)
- 🔒 **Always-safe** — never drops the pinned `system` prompt or the last `keepLast` turns
- 🧩 **Same `Message` shape** as `@lacspace/ai` / `@lacspace/agent` — the window drops straight into any chat API
- 💾 **Persistable** — `toJSON()` / `fromJSON()` round-trip to plain JSON
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed · keyless

## Install

```bash
npm i @lacspace/memory
```

## Quick start

```ts
import { createMemory } from "@lacspace/memory";

const mem = createMemory({
  system: "You are a helpful assistant.",
  maxTokens: 3000,   // budget for the whole window
  keepLast: 4,       // always keep the 4 newest messages verbatim
});

mem.addUser("What's the capital of France?");
mem.addAssistant("Paris.");

await mem.prune();          // trim/summarize to stay within budget
const window = mem.messages(); // system-first Message[] — send to any LLM
```

### Exact token budgets (bring your own counter)

```ts
import { createMemory } from "@lacspace/memory";
import { count } from "@lacspace/tokenizer"; // or any encoder's encode(t).length

const mem = createMemory({ maxTokens: 8000, countTokens: (t) => count(t) });
```

### Summarize old turns instead of forgetting them

```ts
import { createMemory } from "@lacspace/memory";
import { chat } from "@lacspace/ai"; // you supply the key

const mem = createMemory({
  maxTokens: 4000,
  keepLast: 6,
  summarize: async (dropped) => {
    const res = await chat({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY!,
      messages: [
        { role: "system", content: "Summarize this conversation slice in 3 bullet points." },
        ...dropped,
      ],
    });
    return res.text;
  },
});
// When over budget, prune() drops the oldest turns, summarizes them,
// and pins a single `system` "memory_summary" note at the front.
await mem.prune();
```

### Pure helpers (no `Memory` needed)

```ts
import { trimToTokenBudget, estimateMessageTokens, windowMessages } from "@lacspace/memory";

const fitted = trimToTokenBudget(history, { maxTokens: 3000, keepLast: 2 });
const last20 = windowMessages(history, 20);
const cost   = estimateMessageTokens(history); // chars/4 heuristic, or pass a counter
```

## API

| Export | Signature | Description |
| --- | --- | --- |
| `createMemory` | `(opts?: MemoryOptions) => Memory` | Create a budget-aware memory. |
| `Memory.add` | `(m: Message \| Message[]) => void` | Append one or many messages. |
| `Memory.addUser` / `addAssistant` | `(content: string) => void` | Append a user/assistant message. |
| `Memory.addTool` | `(content: string, toolCallId?: string) => void` | Append a tool-result message. |
| `Memory.messages` | `() => Message[]` | The current window (system first if set). |
| `Memory.history` | `() => Message[]` | Everything ever added, in order. |
| `Memory.clear` | `() => void` | Forget history + window (keeps the system prompt). |
| `Memory.size` | `number` | Messages in the window (system included). |
| `Memory.toWindow` | `(opts?: { maxTokens?; maxMessages? }) => Message[]` | Pure, non-mutating trim to a budget. |
| `Memory.prune` | `() => Promise<void>` | Trim to budget; summarize overflow if a `summarize` fn was injected. |
| `Memory.toJSON` / `fromJSON` / `load` | `MemorySnapshot` | Persist / restore as plain JSON. |
| `trimToTokenBudget` | `(msgs, opts?: TrimOptions) => Message[]` | Drop oldest non-system to fit a token/message budget. |
| `estimateMessageTokens` | `(msgs, countTokens?) => number` | Estimate a `Message[]`'s token cost. |
| `windowMessages` | `(msgs, maxMessages, keepSystem?) => Message[]` | Keep the newest N (system kept free). |
| `defaultCountTokens` | `(text) => number` | The built-in chars ÷ 4 estimator. |

### `MemoryOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `system` | `string` | — | System prompt, pinned first, never dropped. |
| `maxMessages` | `number` | — | Cap on window size (excludes the system prompt). |
| `maxTokens` | `number` | — | Token budget for the whole window. |
| `countTokens` | `(text: string) => number` | chars ÷ 4 | **Injectable** token counter. |
| `summarize` | `(messages: Message[]) => Promise<string> \| string` | — | **Injectable**, keyless summarizer for `prune()`. |
| `keepSystem` | `boolean` | `true` | Keep `system` messages when trimming. |
| `keepLast` | `number` | `2` | Always retain the newest N messages verbatim. |

The `Message` shape is shared across the kit:

```ts
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: unknown[];
};
```

## Works great with

- **[@lacspace/ai](https://developer.lacspace.com/packages/ai)** — the provider-agnostic chat client; feed it `mem.messages()`, back a `summarize()` with its `chat()`.
- **[@lacspace/agent](https://developer.lacspace.com/packages/agent)** — give an agent long-running memory across turns.
- **[@lacspace/tokenizer](https://developer.lacspace.com/packages/tokenizer)** — plug its `count` in as `countTokens` for exact budgets.
- **[@lacspace/prompt](https://developer.lacspace.com/packages/prompt)** — compose the window with system/few-shot prompt scaffolding.
- **[@lacspace/chunk](https://developer.lacspace.com/packages/chunk)** — the retrieval-side counterpart for long documents.

Everything is duck-typed and injected, so none of these are required — `@lacspace/memory` has **zero** runtime dependencies.

## Limitations

- **No built-in tokenizer.** The default counter is a chars ÷ 4 heuristic; pass `countTokens` (e.g. `@lacspace/tokenizer`) for exact budgets.
- **`prune()`'s summary path targets token budgets.** A summary note reduces token cost, not message *count* — a `maxMessages`-only budget is enforced by dropping, and adding a summary can leave the window at/over the message count.
- **Summaries are opaque.** `prune()` calls your `summarize()` and stores its string verbatim as a pinned `system` note; quality (and any API cost) is entirely yours.
- **Under extreme pressure** (a budget smaller than the protected `system` + `keepLast` messages) the window can exceed the budget — protected messages are never dropped.
- **In-memory only.** Persistence is manual via `toJSON()`/`fromJSON()`; there is no built-in store or eviction to disk.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/memory` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/memory
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
