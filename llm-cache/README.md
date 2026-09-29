# @lacspace/llm-cache

**Never pay twice for the same LLM call.** A content-hash cache keyed by `(model family, prompt version, normalized input)`, so identical requests, retries after a 429, and repeated rewrites are served from cache. Pluggable async store (in-memory LRU built in; Mongo/Redis/KV via a tiny interface), TTL, stale-if-error, and a `wrap()` memoizer. Zero dependencies, isomorphic.

```bash
npm i @lacspace/llm-cache
```

```ts
import { createLlmCache, memoryStore } from "@lacspace/llm-cache";

const cache = createLlmCache({ store: memoryStore(), ttlMs: 24 * 3600_000, promptVersion: "v3" });

const pack = await cache.wrap(
  { input: condensedSources, model: "gemini", variant: { lang: "ne" } },
  () => callGemini(condensedSources),          // only runs on a miss
  { staleIfError: true },                       // 429? serve the last good result
);

cache.stats(); // { hits, misses, sets }
```

- **Stable key** across runtimes via a wide (128-bit) dependency-free content hash; whitespace-normalized input by default.
- **`wrap(input, fn)`** memoizes an async call: the retry that a rate-limit forces you into costs nothing.
- **Pluggable store** — implement `{ get, set, delete }` (sync or async) over Mongo/Redis/KV to share the cache across PM2 processes or hosts; `kvStore`-style adapters are trivial.
- **TTL + stale-if-error** — expire results, but fall back to the last good one when the provider is down.

Bump `promptVersion` when your template changes and old results retire automatically. Exports `contentHash`, `memoryStore`, and the `CacheStore` interface.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
