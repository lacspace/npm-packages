<div align="center">

# @lacspace/sdk

**One client for the whole Lacspace platform — auth, analytics, e-commerce and raw API, sharing a single connection.**

[![npm version](https://img.shields.io/npm/v/@lacspace/sdk?color=%230b76ef&label=npm)](https://www.npmjs.com/package/@lacspace/sdk)
[![install size](https://packagephobia.com/badge?p=@lacspace/sdk)](https://packagephobia.com/result?p=@lacspace/sdk)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/sdk?label=minzip)](https://bundlephobia.com/package/@lacspace/sdk)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/sdk)
[![license](https://img.shields.io/npm/l/@lacspace/sdk?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> **Not sure which package to use? Start here.** The SDK bundles `@lacspace/api`, `@lacspace/auth` and `@lacspace/analytics` behind one client — so a login token instantly applies to every call — and adds e-commerce helpers on top.

- 🎯 **One instance, one token** — sign in once, everything's authenticated
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm  install @lacspace/sdk      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

// 1 · Authenticate — the token is stored and reused everywhere
const { user } = await lac.auth.login({ email: "you@shop.com", password: "••••••••" });

// 2 · E-commerce helpers
const products = await lac.ecommerce.getProducts();
await lac.ecommerce.addToCart({ productId: products[0]!.id, quantity: 1 });
const { orderId } = await lac.ecommerce.checkout("cart_123");

// 3 · Track what happened
await lac.analytics.track("checkout_completed", { orderId });
```

## What's on the client

```ts
lac.auth        // login, register, me, logout, refresh
lac.analytics   // track, queueEvent, flush, batch
lac.ecommerce   // getProducts, getProduct, addToCart, checkout
lac.api         // the raw typed client for any endpoint
```

Because they share one `api` instance, `lac.auth.login()` authenticates `analytics` and `ecommerce` too — automatically.

## Recipes

**A tiny React login hook**

```tsx
import { useState } from "react";
import { LacspaceSDK, LacspaceApiError } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

export function useLogin() {
  const [error, setError] = useState<string>();
  async function login(email: string, password: string) {
    try {
      const { user } = await lac.auth.login({ email, password });
      return user;
    } catch (e) {
      setError(e instanceof LacspaceApiError && e.status === 401 ? "Invalid credentials" : "Something went wrong");
    }
  }
  return { login, error };
}
```

> Building in React? [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) gives you `useAuth`, `useQuery` and a provider out of the box.

**Anything the helpers don't cover → drop to the raw client**

```ts
const invoices = await lac.api.get("billing/invoices");
await lac.api.post("support/tickets", { subject: "Help" });
```

**Server-side with an API key**

```ts
const lac = new LacspaceSDK({ baseURL, apiKey: process.env.LACSPACE_API_KEY });
```

## New in 2.2.0

Purely additive, injectable, isomorphic helpers — nothing above changed.

**Named environments** — stop hard-coding base URLs:

```ts
import { createClientForEnvironment, resolveEnvironment, configFromEnvironment } from "@lacspace/sdk";

const lac = createClientForEnvironment("staging");            // prod | staging | development | local
resolveEnvironment("production").baseURL;                    // "https://api.lacspace.com/api"
const cfg = configFromEnvironment("staging", { apiKey });     // your options win over the preset
```

**One config, many sources** — layer env preset → shared defaults → per-call overrides (headers deep-merge, `undefined` never clobbers):

```ts
import { mergeConfig } from "@lacspace/sdk";
const opts = mergeConfig(base, { headers: { "X-App": "shop" } }, perRequest);
```

**Correlation / tracing** — trace one operation across auth, analytics and e-commerce:

```ts
import { createRequestContext, correlationHeaders, createIdempotencyKey } from "@lacspace/sdk";

const ctx = createRequestContext();                          // { correlationId, startedAt }
await lac.api.post("orders", cart, {
  headers: { ...correlationHeaders({ id: ctx.correlationId }), "Idempotency-Key": createIdempotencyKey() },
});
```

**Health / ping** — never rejects; reports ok, status and latency:

```ts
import { checkHealth } from "@lacspace/sdk";
const { ok, status, latencyMs } = await checkHealth("https://api.lacspace.com/api/health");
```

**Typed error normalization** — one shape for every failure:

```ts
import { normalizeError, isRetryableError } from "@lacspace/sdk";
try { await lac.ecommerce.checkout("cart_1"); }
catch (e) { const n = normalizeError(e); if (n.retryable) retry(); }  // kind: http|network|timeout|abort|unknown
```

**Transport-agnostic pagination** — an async iterator over any cursor API:

```ts
import { paginate, collectPages } from "@lacspace/sdk";
for await (const item of paginate((cursor) => lac.api.get("feed", { params: { cursor } }))) { /* … */ }
const all = await collectPages((cursor) => lac.api.get("feed", { params: { cursor } }));
```

| Helper | Signature |
| --- | --- |
| `createClientForEnvironment` | `(env, options?) => LacspaceSDK` |
| `resolveEnvironment` | `(env \| preset, overrides?) => EnvironmentPreset` |
| `configFromEnvironment` | `(env, options?) => T` |
| `mergeConfig` | `(...sources) => T` (headers deep-merged) |
| `createRequestContext` | `({ id?, rng?, now? }) => { correlationId, startedAt }` |
| `correlationHeaders` | `({ id?, header?, rng? }) => Record<string,string>` |
| `createCorrelationId` / `createIdempotencyKey` | `(rng?) => string` |
| `checkHealth` | `(url, { fetch?, now?, headers?, signal? }) => HealthResult` |
| `normalizeError` / `isRetryableError` | `(e) => NormalizedError` / `boolean` |
| `paginate` / `collectPages` | `(fetchPage, { start?, maxPages? }) => AsyncGenerator<T>` / `Promise<T[]>` |
| `SDK_VERSION` | `string` |

Every one is pure and injects its IO (`fetch` / clock / RNG), so tests never touch the network.

## One import for everything

Every type and class from `api`, `auth` and `analytics` is re-exported here:

```ts
import { LacspaceSDK, LacspaceApi, LacspaceAuth, LacspaceAnalytics, LacspaceApiError } from "@lacspace/sdk";
import type { Product, LacspaceUser, AnalyticsEvent } from "@lacspace/sdk";
```

## The Lacspace family

| Package | For |
| --- | --- |
| **`@lacspace/sdk`** | Everything in one client (this package) |
| [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api) | The core HTTP client |
| [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth) | Login, register, tokens |
| [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking |
| [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) | React hooks |
| [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat dates |
| [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) | Nepal helpers |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/sdk` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/sdk
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

