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
| `MemoryIdempotencyStore(ttlMs?)` · `IdempotencyStore` | store + interface |
| `fingerprint(payload)` | stable, order-independent request signature |
| `IdempotencyConflictError` · `IdempotencyKeyReuseError` · `ReplayedError` | typed errors |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/idempotency` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/idempotency
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

