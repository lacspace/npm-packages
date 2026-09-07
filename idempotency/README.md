<div align="center">

# @lacspace/idempotency

**Make any operation exactly-once with an idempotency key — replay results on retries, safe under concurrency.**

[![npm version](https://img.shields.io/npm/v/@lacspace/idempotency?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/idempotency)
[![install size](https://packagephobia.com/badge?p=@lacspace/idempotency)](https://packagephobia.com/result?p=@lacspace/idempotency)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/idempotency?label=minzip)](https://bundlephobia.com/package/@lacspace/idempotency)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/idempotency)
[![license](https://img.shields.io/npm/l/@lacspace/idempotency?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The "don't double-charge the card, don't send the email twice" pattern. A client retries; a webhook fires again; a user double-clicks — and your operation runs **once**, replaying the stored result. Every existing library is welded to a framework (Hono, AWS Lambda); this is the framework-agnostic primitive.

> **New in 1.1.0** — request-level helpers: `withIdempotency(key, req, handler, opts)` ties **request fingerprint + in-flight claim + response replay** together for HTTP handlers, `fingerprintRequest(req)` hashes `method + path + body`, and `sweep()` (plus `MemoryIdempotencyStore.sweep()`) prunes expired records. All additive — every 1.0.x export is unchanged.

- ♻️ **Exactly-once** — a repeat key replays the cached result instead of re-running
- 🔒 **Concurrency-safe** — in-flight de-dupe in-process, atomic create-if-absent for shared stores, plus a conflict/wait policy
- 🔎 Optional **request fingerprint** — catch a key reused with a different payload (Stripe-style)
- 🧩 Pluggable store (in-memory built in; bring your own Redis / KV / SQL) · zero deps · isomorphic

## Install

```bash
npm install @lacspace/idempotency      # or pnpm add / yarn add / bun add
```

## Exactly-once in one call

```ts
import { idempotent } from "@lacspace/idempotency";

// in a POST handler — the client sends an Idempotency-Key header
const key = request.headers.get("idempotency-key")!;

const { value, replayed } = await idempotent(key, () => chargeCard(order));
// first request: runs chargeCard, stores the result   → replayed: false
// any retry with the same key: returns the SAME result → replayed: true (no second charge)

return Response.json(value);
```

## Bring your own store

```ts
import { Idempotency, MemoryIdempotencyStore } from "@lacspace/idempotency";

const idem = new Idempotency({ store: new MemoryIdempotencyStore(60 * 60 * 1000) });
// implement { get, create, set, delete } over Redis/KV/SQL for multi-instance apps
```

## Detect key reuse (different payload, same key)

```ts
import { fingerprint } from "@lacspace/idempotency";

await idem.run(key, () => createOrder(body), { fingerprint: fingerprint(body) });
// reusing the key with a different body throws IdempotencyKeyReuseError
```

## One-call request idempotency (new in 1.1.0)

`withIdempotency` fingerprints the request, claims the key, replays the stored **response** (status + body) on retries, and rejects the same key reused with a different request — the full HTTP pattern in one call.

```ts
import { withIdempotency, MemoryIdempotencyStore } from "@lacspace/idempotency";

const store = new MemoryIdempotencyStore(24 * 60 * 60 * 1000);

// inside a POST handler
const key = request.headers.get("idempotency-key")!;
const { response, replayed } = await withIdempotency(
  key,
  { method: request.method, path: url.pathname, body },
  async () => ({ status: 201, body: await createOrder(body) }),
  { store },
);
// first call runs the handler → replayed: false
// retries with the same key + same request → the SAME response, handler never re-runs
// same key + a DIFFERENT request → throws IdempotencyKeyReuseError

return Response.json(response.body, { status: response.status });
```

Bring a store-backed engine for multi-instance apps, and let concurrent duplicates wait for the winner:

```ts
import { Idempotency } from "@lacspace/idempotency";
const engine = new Idempotency({ store });
await withIdempotency(key, req, handler, { idempotency: engine, onConflict: "wait" });
```

## Expiry & sweeping (new in 1.1.0)

```ts
import { sweep, MemoryIdempotencyStore } from "@lacspace/idempotency";

const store = new MemoryIdempotencyStore(60 * 60 * 1000); // 1h record TTL
// periodically reclaim expired records (e.g. on an interval / cron)
const pruned = await sweep(store); // → number removed; 0 for stores without sweep (Redis TTLs prune themselves)
```

## Concurrency

```ts
// Two requests, same key, at the same time:
const [a, b] = await Promise.all([
  idem.run(key, work),
  idem.run(key, work),
]);
// work() runs ONCE; both get the same value. a.replayed=false, b.replayed=true
```

Across processes/instances (shared store), a second call finds an in-progress record and either throws `IdempotencyConflictError` (default) or waits for the result with `{ onConflict: "wait" }`.

## Behaviour

| Situation | Result |
| --- | --- |
| New key | runs `fn`, stores result, `replayed: false` |
| Repeat key (completed) | replays stored value, `replayed: true` |
| `fn` throws | key is cleared → next call retries (unless `cacheErrors: true`) |
| `cacheErrors: true` + prior failure | replays a `ReplayedError` |
| Same key in progress (same process) | de-duped — awaits the one execution |
| Same key in progress (other instance) | `IdempotencyConflictError`, or waits with `onConflict: "wait"` |
| Same key, different `fingerprint` | `IdempotencyKeyReuseError` |

## API

| Export | Description |
| --- | --- |
| `idempotent(key, fn, opts?)` | run at-most-once via a shared in-memory store |
| `new Idempotency({ store?, cacheErrors? })` | engine bound to a store |
| `.run(key, fn, opts?)` → `{ value, replayed }` | the core method |
| `.forget(key)` | clear a key so it can run fresh |
| `MemoryIdempotencyStore(ttlMs?)` · `IdempotencyStore` | store + interface (store adds `sweep(now?)` + `size`) |
| `fingerprint(payload)` | stable, order-independent request signature |
| `withIdempotency(key, req, handler, opts?)` → `{ response, replayed }` | request → at-most-once response replay (new in 1.1.0) |
| `fingerprintRequest(req)` | fingerprint a request from `method` + `path`/`url` + `body` (new in 1.1.0) |
| `sweep(store, now?)` → pruned count | prune expired records from a store (new in 1.1.0) |
| `IdempotencyConflictError` · `IdempotencyKeyReuseError` · `ReplayedError` | typed errors |

`withIdempotency` options extend `run`'s (`store`, `onConflict`, `cacheErrors`, `pollIntervalMs`, `waitTimeoutMs`, `fingerprint`) plus `idempotency` (an `Idempotency` engine to run through). Types: `RequestLike`, `IdempotentResponse<T>`, `WithIdempotencyOptions`, `WithIdempotencyResult<T>`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/idempotency` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/idempotency
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

