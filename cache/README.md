<div align="center">

# @lacspace/cache

**LRU + TTL + stale-while-revalidate, and one-line async memoization. Zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/cache?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/cache)
[![license](https://img.shields.io/npm/l/@lacspace/cache?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> An in-memory cache that does the three things you actually want — bound the size (LRU), expire entries (TTL), and hide latency (stale-while-revalidate) — plus `wrap()`/`memoize()` that cache any async function and **de-duplicate concurrent calls**. Tiny, typed, isomorphic.

## Install

```bash
npm i @lacspace/cache
```

## Use it

```ts
import { createCache } from "@lacspace/cache";

const cache = createCache<User>({ max: 500, ttl: 60_000 });

cache.set("a", user);
cache.get("a");        // user  (or undefined once expired)
cache.has("a");        // true
cache.size;            // 1
```

### Cache an async call — with de-duplication

```ts
// 100 concurrent callers → exactly ONE db call; the rest await the same promise.
const user = await cache.wrap(`user:${id}`, () => db.users.find(id), { ttl: 60_000 });
```

### Stale-while-revalidate (serve instantly, refresh in the background)

```ts
const data = await cache.wrap("dashboard", fetchDashboard, {
  ttl: 30_000,               // fresh for 30s
  staleWhileRevalidate: 60_000, // then serve stale for up to 60s while refreshing
});
// After 30s the cached value is returned immediately AND a refresh kicks off.
```

### Memoize any async function

```ts
import { memoize } from "@lacspace/cache";

const getUser = memoize(db.users.find, { ttl: 60_000, max: 1000 });
await getUser(42);   // fetches
await getUser(42);   // cached
getUser.cache.clear(); // full control when you need it
```

## API

| | |
| --- | --- |
| `createCache({ max, ttl })` | `get` · `set` · `has` · `delete` · `clear` · `keys` · `size` · `wrap` |
| `cache.wrap(key, fn, { ttl, staleWhileRevalidate })` | cached async, in-flight de-dup, optional SWR |
| `memoize(fn, { max, ttl, key, staleWhileRevalidate })` | memoized fn + `.cache` handle |

Pairs with [`@lacspace/retry`](https://www.npmjs.com/package/@lacspace/retry) for resilient, cached calls.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/cache` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/cache
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

