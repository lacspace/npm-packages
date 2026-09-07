<div align="center">

# @lacspace/rate-limit

**Framework-agnostic rate limiting — fixed-window, sliding-window & token-bucket, anywhere.**

[![npm version](https://img.shields.io/npm/v/@lacspace/rate-limit?color=%230ea5e9&label=npm)](https://www.npmjs.com/package/@lacspace/rate-limit)
[![install size](https://packagephobia.com/badge?p=@lacspace/rate-limit)](https://packagephobia.com/result?p=@lacspace/rate-limit)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/rate-limit?label=minzip)](https://bundlephobia.com/package/@lacspace/rate-limit)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/rate-limit)
[![license](https://img.shields.io/npm/l/@lacspace/rate-limit?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Three algorithms over a **pluggable store** (in-memory built in; implement one interface for Redis/Upstash). Returns standard IETF `RateLimit-*` headers. Drop it into any Express/Fastify route, Next.js Route Handler, middleware or edge function.

- 🎛️ `fixed` · `sliding` (log) · `token-bucket` · **`leaky-bucket`** · **weighted sliding-window counter** algorithms
- 🔌 Pluggable `RateLimitStore` (memory included; bring your own Redis)
- 📨 `rateLimitHeaders()` / **`standardRateLimitHeaders()`** → IETF `RateLimit-*` **+ legacy `X-RateLimit-*`** + `Retry-After`
- 💰 Per-request `cost` (weight expensive endpoints heavier)
- 🧮 **Composite limiters** (`combineLimiters` — strictest wins) & **per-route limiters** (`routeLimiter`)
- ⏱️ **Injectable clock** (`ManualClock`) for deterministic tests
- ⚡ Zero dependencies · 🌍 isomorphic (Node, edge, workers) · 📦 ESM + CJS · fully typed

> **New in 1.2.0** — leaky-bucket & weighted sliding-window-counter algorithms, composite + per-route limiters, legacy `X-RateLimit-*` headers, and an injectable clock. Fully backward compatible — nothing existing changed. [Jump to the 1.2 guide ↓](#new-in-120--more-algorithms-composition--an-injectable-clock)

## Install

```bash
npm install @lacspace/rate-limit      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { rateLimit } from "@lacspace/rate-limit";

const limiter = rateLimit({ limit: 10, windowMs: 60_000, algorithm: "sliding" });

const { success, remaining, retryAfter } = await limiter.check(ip);
if (!success) throw new Error(`Rate limited. Retry in ${retryAfter}s`);
```

## Next.js Route Handler

```ts
import { rateLimit, rateLimitHeaders } from "@lacspace/rate-limit";

const limiter = rateLimit({ limit: 5, windowMs: 10_000 });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const result = await limiter.check(ip);
  const headers = rateLimitHeaders(result);
  if (!result.success) return new Response("Too Many Requests", { status: 429, headers });
  // …handle request…
  return Response.json({ ok: true }, { headers });
}
```

## Weight expensive routes

```ts
await limiter.check(userId, 5); // this request costs 5 units
```

## Bring your own store (Redis, Upstash, …)

```ts
import { rateLimit, type RateLimitStore } from "@lacspace/rate-limit";

const redisStore: RateLimitStore = {
  async consume(key, limit, windowMs, cost) {
    // implement with INCR + PEXPIRE (or a Lua script) and return:
    return { success, remaining, reset };
  },
};

const limiter = rateLimit({ limit: 100, windowMs: 60_000, store: redisStore, prefix: "api" });
```

## Algorithms

| Algorithm | Behaviour |
| --- | --- |
| `fixed` | simple counter reset every window — cheapest |
| `sliding` | rolling window log, smooth — no burst at window edges |
| `token-bucket` | steady refill, allows controlled bursts |
| `SlidingWindowCounterStore` | weighted 2-window approximation of the log — smooth, O(1) memory |
| `LeakyBucketStore` | constant outflow, no bursts (smooth pacing) |
| `TokenBucketStore` | explicit burst (capacity) **+** decoupled refill rate |

## The Lacspace WebKit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) | Typed env variables |
| **`@lacspace/rate-limit`** | Rate limiting (this package) |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/next`](https://www.npmjs.com/package/@lacspace/next) | Next.js SDK integration |

## New in 1.1 — request adapters & middleware

```ts
import { rateLimit, ipKeyFromRequest, withRateLimit, rateLimitResponse, expressRateLimit } from "@lacspace/rate-limit";

const limiter = rateLimit({ limit: 10, windowMs: 60_000, algorithm: "sliding" });

// Fetch / Next route / edge — one line, returns a ready 429 or null
export async function POST(req: Request) {
  const blocked = await withRateLimit(limiter, req); // keys by client IP (X-Forwarded-For…)
  if (blocked) return blocked;                        // 429 + RateLimit-* + Retry-After
  // …handle request
}

// Express
app.use(expressRateLimit(limiter, { keyFn: (req) => req.user?.id ?? ipKeyFromRequest(req) }));
```

`ipKeyFromRequest` reads `X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP` and friends; `rateLimitResponse(result)` builds the 429 yourself if you prefer.

## New in 1.2.0 — more algorithms, composition & an injectable clock

All additive — every existing export, option and default is unchanged.

### More algorithms (opt-in via `store`)

```ts
import {
  rateLimit,
  LeakyBucketStore,
  SlidingWindowCounterStore,
  TokenBucketStore,
} from "@lacspace/rate-limit";

// Leaky bucket — constant outflow, no bursts.
rateLimit({ limit: 10, windowMs: 1000, store: new LeakyBucketStore() });

// Weighted sliding-window counter — smooth like the log, O(1) memory per key.
rateLimit({ limit: 100, windowMs: 60_000, store: new SlidingWindowCounterStore() });

// Token bucket with an explicit burst (capacity = limit) + decoupled refill rate.
rateLimit({ limit: 20, windowMs: 60_000, store: new TokenBucketStore({ refill: 1, intervalMs: 1000 }) });
```

### Composite & per-route limiters

```ts
import { rateLimit, combineLimiters, routeLimiter } from "@lacspace/rate-limit";

// Enforce several caps at once — the STRICTEST wins.
const combined = combineLimiters(
  rateLimit({ limit: 10, windowMs: 1_000 }),        // 10 / second
  rateLimit({ limit: 1_000, windowMs: 86_400_000 }) // AND 1000 / day
);
const { success } = await combined.check(ip);

// Named per-route limiters (each route has its own budget).
const routes = routeLimiter({
  "auth/login": rateLimit({ limit: 5, windowMs: 60_000 }),
  search:       rateLimit({ limit: 30, windowMs: 60_000 }),
}, /* optional fallback */ rateLimit({ limit: 100, windowMs: 60_000 }));

await routes.check("search", ip);
```

### Standard headers (IETF + legacy `X-RateLimit-*`)

```ts
import { standardRateLimitHeaders } from "@lacspace/rate-limit";

const headers = standardRateLimitHeaders(result);          // both header families
const ietfOnly = standardRateLimitHeaders(result, { legacy: false });
const deterministic = standardRateLimitHeaders(result, { now: 0 }); // pure — pass `now`
```

Emits `RateLimit-Limit/Remaining/Reset` (Reset = seconds until reset), `X-RateLimit-Limit/Remaining/Reset` (Reset = epoch seconds) and `Retry-After` when blocked. `rateLimitHeaders()` (IETF-only) is unchanged.

### Injectable clock (deterministic tests)

```ts
import { rateLimit, ManualClock, TokenBucketStore } from "@lacspace/rate-limit";

const clock = new ManualClock(0);
const limiter = rateLimit({ limit: 5, windowMs: 1000, clock, store: new TokenBucketStore({ clock }) });
await limiter.check("k");
clock.advance(1000); // drive time forward without real sleeps
```

### API additions

| Export | Signature | Purpose |
| --- | --- | --- |
| `LeakyBucketStore` | `new LeakyBucketStore({ clock? })` | Constant-outflow leaky bucket store |
| `SlidingWindowCounterStore` | `new SlidingWindowCounterStore({ clock? })` | Weighted sliding-window counter store |
| `TokenBucketStore` | `new TokenBucketStore({ clock?, refill?, intervalMs? })` | Token bucket with explicit burst + refill |
| `combineLimiters` | `(...limiters) => CombinedLimiter` | Enforce all; strictest result wins |
| `routeLimiter` | `(routes, fallback?) => RouteLimiter` | Named per-route limiters |
| `standardRateLimitHeaders` | `(result, { now?, legacy? }?) => Record<string,string>` | IETF + legacy headers (pure) |
| `ManualClock` / `systemClock` | `new ManualClock(start?)` / `Clock` | Injectable clock |
| `RateLimiterOptions.clock` | `clock?: Clock` | Optional clock for the built-in store |

All algorithms honour cost-weighting (`check(key, cost)`) and the pluggable `RateLimitStore` interface.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/rate-limit` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/rate-limit
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

