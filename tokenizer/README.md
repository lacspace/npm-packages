<div align="center">

# @lacspace/tokenizer

**Fast LLM token estimates, cost math and context budgeting — without the 3 MB tokenizer.**

[![npm version](https://img.shields.io/npm/v/@lacspace/tokenizer?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/tokenizer)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/tokenizer?label=minzip)](https://bundlephobia.com/package/@lacspace/tokenizer)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/tokenizer)
[![license](https://img.shields.io/npm/l/@lacspace/tokenizer?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Estimate token counts, calculate USD cost, and trim prompts to fit a context window — with a tuned heuristic that lands within roughly **±10–15%** of the real GPT / Claude / Gemini tokenizers. No `tiktoken`, no wasm download, no native build. Zero dependencies, isomorphic, fully typed.

> ⚠️ **This is an estimate, not exact billing.** It is designed for budgeting, cost previews, guardrails and chunking — where a fast, good-enough number beats a 3 MB dependency. For exact accounting, read the token counts in the provider's API **`usage`** response.

> **🆕 New in 1.1.0** — context-window usage helpers (`contextUsage` / `remainingContext` / `willReplyFit`), batch estimation (`countBatch` / `estimateBatchCost`), one-call prompt pricing (`estimatePromptCost`) and cross-model cost comparison (`compareModelCost` / `cheapestModel`), plus fresh model presets (GPT-4.1, o3/o4-mini, Claude 3.7 / Sonnet 4 / Opus 4, Gemini 2.5). All additive — nothing existing changed.

- 🔢 `countTokens` / `countMessageTokens` — heuristic estimator with OpenAI-style message overhead
- 💵 `estimateCost` / `estimatePromptCost` — USD from a built-in pricing table (`MODELS`) with alias handling
- ⚖️ `compareModelCost` / `cheapestModel` — price the same workload across models, cheapest first
- 📊 `contextUsage` / `remainingContext` / `willReplyFit` — how much of the context window is used / left
- 📚 `countBatch` / `estimateBatchCost` — tokens & cost for a whole list of prompts at once
- ✂️ `fitToBudget` — truncate text (`end` / `start` / `middle`) to fit a token budget
- 🧵 `budgetMessages` — drop the oldest turns, keep the system prompt + newest, until a chat fits
- 📦 `splitByTokens` — quick token-budgeted chunking with overlap
- 🌍 Zero dependencies · runs in Node ≥18, browser, edge & serverless · fully typed

## Install

```bash
npm i @lacspace/tokenizer
```

## Count tokens

```ts
import { countTokens, countMessageTokens } from "@lacspace/tokenizer";

countTokens("The quick brown fox jumps over the lazy dog."); // ~10
countTokens("function add(a, b) { return a + b; }", "gpt-4o"); // ~14
countTokens("Estimer les tokens", "claude-3-5-sonnet"); // Claude family scales up a little

countMessageTokens([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello!" },
]); // content tokens + per-message role/format overhead
```

## Estimate cost

```ts
import { estimateCost } from "@lacspace/tokenizer";

estimateCost({ model: "gpt-4o", inputTokens: 1000, outputTokens: 500 });
// {
//   usd: 0.0075,
//   breakdown: { input: 0.0025, output: 0.005, inputTokens: 1000, outputTokens: 500,
//                inputPricePerM: 2.5, outputPricePerM: 10 }
// }

// Combine with counting for a pre-flight price check:
import { countTokens } from "@lacspace/tokenizer";
const inputTokens = countTokens(prompt, "claude-3-5-sonnet");
estimateCost({ model: "claude-3-5-sonnet", inputTokens, outputTokens: 800 }).usd;
```

Aliases and dated ids resolve automatically — `modelInfo("gpt-4o-2024-08-06")`, `modelInfo("sonnet")`, `modelInfo("gemini-1.5-flash-latest")` all work, and unknown ids fall back sensibly (never throw).

### Price a prompt in one call, or compare models

```ts
import { estimatePromptCost, compareModelCost, cheapestModel } from "@lacspace/tokenizer";

estimatePromptCost(prompt, "gpt-4o", { outputTokens: 500 }).usd; // count + price in one step

// Same workload, priced across every model in the table, cheapest first:
compareModelCost({ inputTokens: 100_000, outputTokens: 20_000 });
// [ { model: "gemini-1.5-flash", usd: …, estimate }, … ]

cheapestModel({ inputTokens: 100_000, outputTokens: 20_000 }, ["gpt-4o", "sonnet", "gemini-2.5-flash"]);
// → the lowest-cost option among the given models
```

## Batch estimation

```ts
import { countBatch, estimateBatchCost } from "@lacspace/tokenizer";

countBatch(documents, "gpt-4o");
// { tokens: number[], total, max, count }

estimateBatchCost(documents, "gpt-4o", { outputTokensEach: 0 });
// { usd, totalInputTokens, totalOutputTokens, count, items: CostEstimate[] }
```

## Fit text to a budget

```ts
import { fitToBudget } from "@lacspace/tokenizer";

fitToBudget(longArticle, 2000, { strategy: "end" });
// { text: "…first 2000 tokens… …", tokens: <=2000, truncated: true }

fitToBudget(longArticle, 2000, { strategy: "middle" });  // keep both ends, cut the middle
fitToBudget(shortNote, 2000);                            // fits already → { truncated: false }
```

| strategy | keeps | marker |
| --- | --- | --- |
| `"end"` (default) | the beginning | `"foo …"` |
| `"start"` | the end | `"… bar"` |
| `"middle"` | both ends | `"foo … bar"` |

## Keep a conversation inside the window

```ts
import { budgetMessages, willFit } from "@lacspace/tokenizer";

const trimmed = budgetMessages(history, 8000, {
  model: "gpt-4o",
  keepSystem: true, // never drop the system prompt
  reserve: 1000,    // hold back room for the reply
});
// oldest non-system turns are dropped until it fits; system + newest are kept

willFit(trimmed, "gpt-4o");            // true
willFit(hugeString, "gpt-3.5-turbo");  // false
```

### How much of the window is left?

```ts
import { contextUsage, remainingContext, willReplyFit } from "@lacspace/tokenizer";

contextUsage(history, "gpt-4o");
// { used, window: 128000, remaining, fraction: 0..1, fits }

remainingContext(history, "gpt-4o");     // tokens still free (clamped to 0)
willReplyFit(history, 1000, "gpt-4o");   // room for the prompt AND a ~1000-token reply?
```

## Chunk long text

```ts
import { splitByTokens } from "@lacspace/tokenizer";

const chunks = splitByTokens(bigDocument, 500, 50); // ~500 tokens each, 50 overlap
// → string[]; each chunk estimates <= 500 tokens, consecutive chunks share context
```

> This is a **basic** word-boundary splitter. For structure-aware chunking (markdown headings, code blocks, sentence boundaries) use a dedicated splitter — this one is for quick, budget-bounded slices.

## API

| Export | Signature | Notes |
| --- | --- | --- |
| `countTokens` | `(text, model?) => number` | heuristic estimate; `0` for empty |
| `countMessageTokens` | `(messages, model?) => number` | adds OpenAI-style per-message overhead |
| `estimateCost` | `({ model, inputTokens, outputTokens? }) => { usd, breakdown }` | USD from `MODELS` |
| `estimatePromptCost` | `(text, model, { outputTokens? }) => CostEstimate` | count `text` then price it |
| `compareModelCost` | `({ inputTokens, outputTokens? }, models?) => ModelCostComparison[]` | price across models, cheapest first |
| `cheapestModel` | `({ inputTokens, outputTokens? }, models?) => ModelCostComparison \| undefined` | lowest-cost option |
| `contextUsage` | `(text \| messages, model?) => { used, window, remaining, fraction, fits }` | context-window usage |
| `remainingContext` | `(text \| messages, model?) => number` | tokens free (clamped to 0) |
| `willReplyFit` | `(text \| messages, replyTokens, model?) => boolean` | room for prompt + reply |
| `countBatch` | `(texts, model?) => { tokens, total, max, count }` | per-item + total token counts |
| `estimateBatchCost` | `(texts, model, { outputTokensEach? }) => { usd, totalInputTokens, totalOutputTokens, count, items }` | batch cost |
| `fitToBudget` | `(text, maxTokens, { strategy?, model? }) => { text, tokens, truncated }` | truncate to fit |
| `budgetMessages` | `(messages, maxTokens, { model?, keepSystem?, reserve? }) => messages` | drop oldest turns |
| `willFit` | `(text \| messages, model?) => boolean` | vs the model's context window |
| `splitByTokens` | `(text, maxTokensPerChunk, overlap?, model?) => string[]` | budgeted chunking |
| `modelInfo` | `(model?) => ModelInfo` | resolve id/alias → `{ input, output, contextWindow, family }` |
| `modelFamily` | `(model?) => "gpt" \| "claude" \| "gemini"` | tokenizer family |
| `MODELS` | `Record<ModelId, ModelInfo>` | pricing (USD/1M) + context windows |
| `MODEL_ALIASES` | `Record<string, ModelId>` | shorthands & dated variants |

Models in the table: `gpt-4o`, `gpt-4o-mini`, `o1`, `o1-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3`, `o3-mini`, `o4-mini`, `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus`, `claude-3-7-sonnet`, `claude-sonnet-4`, `claude-opus-4`, `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.5-pro`, `gemini-2.5-flash` (plus many aliases & dated ids). Prices are list prices at the time of writing and **drift** — confirm against the provider before real billing.

## How it works

`countTokens` splits text into typed runs — words, digit runs, whitespace and punctuation/symbols — and scores each the way byte-pair tokenizers tend to: common short words are one token, longer words split roughly every ~5 characters, digit runs group ~3 at a time, a lone inter-word space is absorbed into the next token, and newlines / indentation cost extra. The raw score is calibrated against OpenAI's `o200k`/`cl100k` tokenizers, then scaled per family (Claude and Gemini emit slightly more tokens for the same text). On ordinary English prose it typically lands within ~10%, and within ~15% on source code.

## Honest limitations

- **It is an approximation.** Individual counts can be off, especially for heavy code, dense punctuation, non-Latin scripts, emoji and unusual formatting. Do not use it for exact billing — use the API `usage` response.
- **Prices drift.** The `MODELS` table reflects published list prices at the time of writing and will go stale. Confirm against the provider's current pricing page for anything that matters.
- **Message overhead is modelled, not exact.** Real per-message framing varies by provider and endpoint; tool/function schemas and images are **not** counted.
- **`splitByTokens` is basic** — word boundaries only, no awareness of markdown/code/sentence structure.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/tokenizer` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/tokenizer
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
