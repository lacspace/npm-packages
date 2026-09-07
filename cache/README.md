<div align="center">

# @lacspace/cache

**LRU + TTL + stale-while-revalidate, and one-line async memoization. Zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/cache?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/cache)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/cache?label=minzip)](https://bundlephobia.com/package/@lacspace/cache)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/cache)
[![license](https://img.shields.io/npm/l/@lacspace/cache?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> An in-memory cache that does the things you actually want — bound the size (LRU **or LFU**), expire entries (TTL), and hide latency (stale-while-revalidate) — plus `wrap()`/`getOrSet()`/`memoize()` that cache any async function and **de-duplicate concurrent calls**. Tiny, typed, isomorphic.

**New in 1.1.0** — LFU eviction (`policy: "lfu"`), `getOrSet()`, **tag-based invalidation** (`tags` + `invalidateTag`), `deleteMany()`, hit/miss/eviction `stats()`, `purge()`, an injectable `clock` for tests, and an `onEvict` listener. All additive — every 1.0 API is unchanged.

- 📦 `createCache({ max, ttl, policy, clock, onEvict })` — LRU/LFU + per-entry TTL, `get`/`set`/`has`/`delete`/`clear`/`keys`/`size`
- 🔁 `cache.wrap(key, fn)` / `cache.getOrSet(key, fn)` — cache an async call and **de-dupe concurrent callers** into one fetch (single-flight)
- ⚡ `staleWhileRevalidate` — serve the stale value instantly, refresh in the background
- 🏷️ `tags` + `cache.invalidateTag(tag)` / `cache.deleteMany(pattern)` — group and drop related entries
- 📊 `cache.stats()` — hits · misses · sets · evictions · expirations · hitRate; `cache.purge()` sweeps expired
- 🧠 `memoize(fn)` — one-line async memoization with a `.cache` handle
- 🌍 Zero dependencies · isomorphic · fully typed

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

### LFU eviction

```ts
// Keep the 500 hottest keys; the least-frequently-used are evicted first.
const cache = createCache({ max: 500, policy: "lfu" });
```

### Tag related entries and drop them together

```ts
cache.set("user:1", user, 0, { tags: ["user", "team:9"] });
await cache.wrap("user:1:posts", loadPosts, { tags: ["user", "team:9"] });

cache.invalidateTag("team:9"); // → both entries gone; returns how many
cache.deleteMany("user:");     // prefix, RegExp, or predicate → count removed
```

### Stats & a testable clock

```ts
const cache = createCache({ ttl: 1000, clock: () => myFakeNow() });
cache.get("miss");
cache.stats(); // { hits, misses, sets, evictions, expirations, size, hitRate }
cache.purge(); // sweep expired entries now → count removed
```

## API

| | |
| --- | --- |
| `createCache({ max, ttl, policy, clock, onEvict })` | `get` · `set(k,v,ttl?,{tags}?)` · `has` · `delete` · `clear` · `keys` · `size` · `wrap` · `getOrSet` · `invalidateTag` · `deleteMany` · `purge` · `stats` · `resetStats` |
| `cache.wrap(key, fn, { ttl, staleWhileRevalidate, tags })` | cached async, single-flight de-dup, optional SWR |
| `cache.getOrSet(key, factory, opts)` | alias of `wrap` — cache-or-produce with single-flight |
| `cache.invalidateTag(tag)` · `cache.deleteMany(prefix\|RegExp\|fn)` | drop grouped/matching entries → count |
| `cache.stats()` · `cache.purge()` | hit/miss/eviction counters · sweep expired |
| `memoize(fn, { max, ttl, policy, clock, key, staleWhileRevalidate, tags })` | memoized fn + `.cache` handle |

`policy` is `"lru"` (default) or `"lfu"`. `clock` defaults to `Date.now`. Eviction only happens once `max` (default `1000`) is exceeded.

Pairs with [`@lacspace/retry`](https://www.npmjs.com/package/@lacspace/retry) for resilient, cached calls.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/cache` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/cache
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

