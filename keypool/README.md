# @lacspace/keypool

**Turn five free keys into one big quota.** Provider-agnostic API-key rotation and rate-limit accounting: pool N keys per provider, track RPM/RPD/TPM/TPD per key (and per model — Groq's token-per-day is per model), round-robin among healthy keys, cool down on `429` using `retry-after`, and quarantine invalid keys. `pick()` hands you a usable key or `null`; `report()` feeds the outcome back. Persist state through a tiny adapter so every process shares one pool. Zero dependencies, isomorphic.

```bash
npm i @lacspace/keypool
```

```ts
import { createKeypool, kvStore } from "@lacspace/keypool";

const pool = createKeypool({
  keys: [
    { id: "gem-1", provider: "gemini", secret: process.env.GEMINI_1! },
    { id: "gem-2", provider: "gemini", secret: process.env.GEMINI_2! },
    { id: "gem-3", provider: "gemini", secret: process.env.GEMINI_3! },
  ],
  providerLimits: { gemini: { rpm: 15, rpd: 1500, tpm: 1_000_000 } },
  store: kvStore(myMongoKv),   // shared across PM2 workers
});

const picked = await pool.pick("gemini", "gemini-2.0-flash", estTokens);
if (!picked) throw new Error("all keys cooling down / quota spent");
try {
  const res = await callGemini(picked.secret, prompt);
  await pool.report(picked.id, { ok: true, tokens: res.usage.total, model: "gemini-2.0-flash" });
} catch (e) {
  await pool.report(picked.id, { ok: false, status: e.status, headers: e.headers });
}
```

- **Windowed accounting** — RPM/RPD/TPM/TPD roll automatically; `pick(provider, model, estTokens)` only returns a key that can afford the call.
- **Per-model buckets** — `modelLimits["groq:llama-3.3-70b"]` are tracked separately, because that's how the provider counts.
- **429 aware** — cools a key down for `retry-after` (seconds or an HTTP date), or a default window; recovers automatically.
- **Invalid quarantine** — a `401/403` sidelines a key until you `reinstate(id, newSecret)`.
- **Priority + round-robin** — prefer some keys, otherwise spread load least-recently-used first, deterministically.
- **Shared state** — pass a `KeypoolStore` (Mongo/Redis/KV) so multiple processes don't each burn the same quota; `kvStore(kv)` wraps any `{get,set}`.

Secrets live only in memory on the `KeySpec`; the persisted state is counters and health, never the key. Exports `createKeypool`, `kvStore`, and the state types.

## AI key chain: route-ordered failover <sup>1.1.0</sup>

`createAiChain` holds every key you have and tries them in a fixed route order, moving on only when one fails. It isn't a rotation. It is packaged from ShareRocketPro's production pool, built to WeNepal's rules, and calls go through [`@lacspace/ai`](https://www.npmjs.com/package/@lacspace/ai).

```ts
import { createAiChain, redisStore } from "@lacspace/keypool";

const ai = createAiChain({
  keys: [
    { id: "gem-1", provider: "gemini", apiKey: process.env.GEMINI_KEY_1! },
    { id: "gem-2", provider: "gemini", apiKey: process.env.GEMINI_KEY_2! },
    { id: "groq-1", provider: "groq", apiKey: process.env.GROQ_KEY! },
  ],                                                  // or an async loader (keys from your DB)
  route: [
    { provider: "gemini", model: "gemini-3.1-flash-lite" },
    { provider: "groq", model: "openai/gpt-oss-120b" },
  ],
  routes: { wrap: [{ provider: "groq", model: "openai/gpt-oss-120b" }] }, // per purpose
  purposeCaps: { wrap: 50 },                          // per day, via takePurpose()
  store: redisStore(redisClient),                     // share rests across processes (default: memory)
  onCall: (row) => ledger.insert(row),                // every attempt; never the key or text
  onInvalid: (key, why) => markKeyInvalid(key.id, why),
});

const r = await ai.chat({ purpose: "wrap", messages, maxTokens: 600, json: true });
r.text; r.json; r.provider; r.model; r.keyId; r.usage; r.attempts;
```

| Situation | What happens |
|---|---|
| 429 per-minute limit | That **key+model pair** rests for the delay the provider gives (Gemini `retryDelay`, Groq "try again in 2m3s"), minimum 20 s. Other models on the same key keep working. |
| 429 daily quota (PerDay, RPD, TPD, "daily") | Gemini rests until **Pacific midnight**, when Google resets quotas. Other providers rest max(retry-after, 15 min). |
| 402 billing | Rests 6 h. |
| 401/403, or Gemini 400 "API key not valid" | The key is marked **invalid** and skipped until `clearRests(id)`. `onInvalid` fires. |
| 5xx, timeout, network | One retry. After `failThreshold` (3) failures in a row, the key rests `coolMinutes` (10). A success resets the count. |
| "overloaded" / UNAVAILABLE | That step's other keys are skipped, since they'd hit the same model. |
| Groq 413 or TPM 429 | `max_tokens` shrinks to fit (from "Limit X, Requested Y") and retries once. |
| Empty reply from a reasoning model | Retried once with a bigger budget (×2.5, 2000–8000). Providers get a `minTokens` floor (gpt-oss 1600). |
| `json: true` | Adds `response_format: json_object` where supported. Groq's `json_validate_failed` retries without it. The reply is fence-stripped and repaired into `r.json`. |
| Bad request / unknown model | That step is skipped; the next one may work. |
| Everything resting | The soonest-to-recover pair is tried once before giving up. |

The default `tweak` gives Gemini Flash (not Flash-Lite 3.x, which rejects it) `thinkingBudget: 0` and gives gpt-oss `reasoning_effort: "low"`.

Built-in providers: `gemini`, `groq`, `cerebras`, `openai`, `anthropic`, `deepseek`, `openrouter`. Add any OpenAI-compatible one through `providers`.

**Shared state without Redis (1.3.0):** `mongoStore(db.collection("ai_pool"), "prefix:")` takes a plain MongoDB driver Collection (Mongoose: `mongoose.connection.db.collection("ai_pool")`), so keypool stays dependency-free.
- **Expiry:** values are documents with an `expiresAt` field and a TTL index. Reads also check expiry, because Mongo sweeps only about once a minute.
- **Counters:** atomic `$inc` upserts. The expiry is set on insert only, and an expired counter restarts at 1.
- **Testing:** checked against a real MongoDB 8 server, including 20 concurrent increments.

**Shrink floor (1.3.0):** a TPM/OTPM shrink never goes below the provider's `minTokens`. If it would have to, a 413 moves on to the next step instead of making a retry that is certain to fail.

Panel helpers: `setOptions(patch)` (1.2.0) changes the route, caps or thresholds live without losing rests; `rests()` lists resting pairs, `clearRests(id)` resets a key after a re-test, `isInvalid(id)` checks a key. Utilities: `msToPacificMidnight()`, `retryAfterMs(text)`.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
