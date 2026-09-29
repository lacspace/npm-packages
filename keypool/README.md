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

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
