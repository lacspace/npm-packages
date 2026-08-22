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

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
