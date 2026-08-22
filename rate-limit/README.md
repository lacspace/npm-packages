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

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
