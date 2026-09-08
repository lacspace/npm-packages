<div align="center">

# @lacspace/providers

**A keyless registry of connection presets for LLM & embedding endpoints — free and local ones first. Zero dependencies, isomorphic, fully typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/providers?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/providers)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/providers?label=minzip)](https://bundlephobia.com/package/@lacspace/providers)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/providers)
[![license](https://img.shields.io/npm/l/@lacspace/providers?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Point [`@lacspace/ai`](https://www.npmjs.com/package/@lacspace/ai) or [`@lacspace/embeddings`](https://www.npmjs.com/package/@lacspace/embeddings) at a **free or local** model in one line. This package ships **no keys** and **proxies nothing** — it's pure, public config: base URLs, endpoint paths, model ids and auth style. You bring your own free key (or run [Ollama](https://ollama.com) locally, which needs none).

- 🆓 **Free-first** — Ollama (local), Groq, OpenRouter `:free` models, Google AI Studio, Cohere trial, Cloudflare Workers AI and more, marked honestly
- 🔑 **Keyless & pure** — no secrets bundled, no `process.env` read implicitly, no network calls; just data + tiny helpers
- 🧩 **Drop-in** — `resolveConfig()` returns a `{ baseUrl, apiKey?, model?, headers, apiStyle }` object shaped for the Lacspace AI stack
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed

## Install

```sh
npm i @lacspace/providers
```

## Usage

```ts
import { resolveConfig, freeProviders, getProvider } from "@lacspace/providers";

// 1. Local & free — no key at all
const local = resolveConfig("ollama", { model: "llama3.1" });
// => { baseUrl: "http://localhost:11434", model: "llama3.1", headers: {}, apiStyle: "ollama" }

// 2. A free hosted tier — bring your own free key
const groq = resolveConfig("groq", {
  apiKey: process.env.GROQ_API_KEY,      // you supply it — never read implicitly
  model: "llama-3.1-8b-instant",
});
// => { baseUrl: "https://api.groq.com/openai/v1", apiKey: "…", model: "…",
//      headers: { Authorization: "Bearer …" }, apiStyle: "openai" }

// 3. Discover what's free
freeProviders().map((p) => `${p.id} — ${p.freeNotes}`);

// 4. Inspect a preset
getProvider("openrouter")?.models?.chat; // ["…:free", …]
```

### Wire it into `@lacspace/ai`

`resolveConfig` returns exactly the fields the Lacspace AI stack reads:

```ts
import { createClient } from "@lacspace/ai";
import { resolveConfig } from "@lacspace/providers";

const cfg = resolveConfig("groq", { apiKey: process.env.GROQ_API_KEY });
const ai = createClient({
  provider: "openai-compatible", // cfg.apiStyle maps to the client's provider
  baseUrl: cfg.baseUrl,
  apiKey: cfg.apiKey,
  headers: cfg.headers,
  defaultModel: cfg.model,
});
```

## API

| Export | Signature | Notes |
| --- | --- | --- |
| `PROVIDERS` | `Record<string, ProviderPreset>` | The curated preset table. |
| `getProvider` | `(id: string) => ProviderPreset \| undefined` | Safe lookup (own-property only). |
| `listProviders` | `(opts?: { free?: boolean; apiStyle?: ApiStyle }) => ProviderPreset[]` | Filter by free/dialect. |
| `freeProviders` | `() => ProviderPreset[]` | Sugar for `listProviders({ free: true })`. |
| `resolveConfig` | `(id, opts?: { apiKey?; model?; baseUrl? }) => ResolvedConfig` | Merge preset + your key/model. Throws on unknown id. |
| `buildAuthHeaders` | `(preset, apiKey?) => Record<string, string>` | Pure auth-header builder. |
| _types_ | `ProviderPreset`, `ApiStyle`, `AuthStyle`, `ResolvedConfig`, `ListProvidersOptions`, `ResolveConfigOptions` | |

### `ResolvedConfig`

```ts
interface ResolvedConfig {
  baseUrl: string;
  apiKey?: string;                    // only from opts.apiKey — never the environment
  model?: string;                     // opts.model, else the preset's first chat model
  headers: Record<string, string>;    // ready-to-merge auth headers
  apiStyle: ApiStyle;                 // "openai" | "anthropic" | "google" | "ollama" | "cohere"
}
```

### Bundled providers

| id | dialect | free? |
| --- | --- | --- |
| `ollama` | ollama | ✅ local, keyless |
| `openai-compatible` | openai | ✅ self-hosted (vLLM/LM Studio/LocalAI) |
| `groq` | openai | ✅ free tier |
| `openrouter` | openai | ✅ `:free` models |
| `together` | openai | ✅ some free models + trial credit |
| `cloudflare-workers-ai` | openai | ✅ free daily allocation |
| `google-ai-studio` | google | ✅ free tier |
| `cohere` | cohere | ✅ trial keys |
| `mistral` | openai | ✅ free experiment tier |
| `deepseek` | openai | ❌ paid |
| `openai` | openai | ❌ paid |
| `anthropic` | anthropic | ❌ paid |

**Works great with:** [`@lacspace/ai`](https://www.npmjs.com/package/@lacspace/ai) (chat client) and [`@lacspace/embeddings`](https://www.npmjs.com/package/@lacspace/embeddings) (embeddings + vector math) — this package just hands them a `baseUrl` / `apiKey` / `model` / `headers`. Pairs with [`@lacspace/chunk`](https://www.npmjs.com/package/@lacspace/chunk) and [`@lacspace/vector`](https://www.npmjs.com/package/@lacspace/vector) in a RAG stack.

## Accuracy & ToS disclaimer

The presets here are **config only** — they make no network calls and store no keys. Base URLs, model ids, free-tier availability and rate limits **change frequently** and vary by region and account. Always confirm against each provider's official docs (`preset.docsUrl`) and **comply with that provider's Terms of Service** for your use case. A `free: true` flag reflects a genuinely free tier or a local/keyless option *at the time of writing* — it is not a guarantee, and "free" tiers often carry rate limits, data-usage terms, or eligibility conditions. You are responsible for the key you supply and how you use each endpoint.

## Limitations

- **Config, not a client.** This package resolves connection settings; the actual HTTP calls happen in `@lacspace/ai` / `@lacspace/embeddings` or your own code.
- **No `process.env` reads.** To stay pure and isomorphic, `resolveConfig` never sources a key from the environment — `envKey` only *documents* the conventional variable; you pass `apiKey` yourself.
- **Model lists are illustrative**, not exhaustive or guaranteed-current; the default model is simply the first listed chat model.
- **Placeholder URLs** — `cloudflare-workers-ai` (`{account_id}`) and `google-ai-studio`/native paths (`{model}`) contain placeholders you (or the client) must fill in; `openai-compatible` defaults to a local host you should override.
- **Query-auth keys** (Google) are returned on `ResolvedConfig.apiKey`, not in `headers`, because the key goes in the URL — the consuming client appends it.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/providers` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/providers
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
