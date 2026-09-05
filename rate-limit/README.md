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

- 🎛️ `fixed` · `sliding` · `token-bucket` algorithms
- 🔌 Pluggable `RateLimitStore` (memory included; bring your own Redis)
- 📨 `rateLimitHeaders()` → `RateLimit-Limit/Remaining/Reset` + `Retry-After`
- 💰 Per-request `cost` (weight expensive endpoints heavier)
- ⚡ Zero dependencies · 🌍 isomorphic (Node, edge, workers) · 📦 ESM + CJS · fully typed

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
| `sliding` | rolling window, smooth — no burst at window edges |
| `token-bucket` | steady refill, allows controlled bursts |

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

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/rate-limit` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/rate-limit
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

