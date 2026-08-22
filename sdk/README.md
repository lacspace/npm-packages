# @lacspace/sdk

[![npm](https://img.shields.io/npm/v/@lacspace/sdk.svg)](https://www.npmjs.com/package/@lacspace/sdk) [![license](https://img.shields.io/npm/l/@lacspace/sdk.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

The all-in-one TypeScript SDK for Lacspace. One client that bundles [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api), [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth), and [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics) — all sharing a single connection, so a login token instantly applies to every call — plus handy e-commerce helpers.

**Start here if you're not sure which package to use.**

- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/sdk
```

## Quick start

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

// 1. Authenticate — the token is stored and reused everywhere
const { user } = await lac.auth.login({ email: "you@shop.com", password: "••••••••" });

// 2. Use e-commerce helpers
const products = await lac.ecommerce.getProducts();
await lac.ecommerce.addToCart({ productId: products[0]!.id, quantity: 1 });
const { orderId } = await lac.ecommerce.checkout("cart_123");

// 3. Track what happened
await lac.analytics.track("checkout_completed", { orderId });
```

## What's on the client

```ts
const lac = new LacspaceSDK({ baseURL });

lac.auth        // → LacspaceAuth      (login, register, me, logout, refresh)
lac.analytics   // → LacspaceAnalytics (track, queueEvent, flush, batch)
lac.ecommerce   // → e-commerce helpers (below)
lac.api         // → LacspaceApi       (raw client for any endpoint)
```

Because they share one `api` instance, `lac.auth.login(...)` authenticates `lac.analytics` and `lac.ecommerce` too — automatically.

### E-commerce helpers

```ts
await lac.ecommerce.getProducts();          // Product[]
await lac.ecommerce.getProduct("p_123");    // Product
await lac.ecommerce.addToCart({ productId: "p_123", quantity: 2 });
await lac.ecommerce.checkout("cart_123");   // { orderId }
```

### Anything else → drop to the raw client

```ts
const invoices = await lac.api.get("billing/invoices");
await lac.api.post("support/tickets", { subject: "Help" });
```

## Configuration

```ts
const lac = new LacspaceSDK({
  baseURL: "https://api.lacspace.com/api", // required (or LACSPACE_API_URL)
  apiKey: "server-side-key",               // optional (or LACSPACE_API_KEY)
  headers: { "X-App": "web" },             // optional
});
```

## Example: a tiny React login hook

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

## Error handling

Any non-2xx response throws `LacspaceApiError` (re-exported here):

```ts
import { LacspaceApiError } from "@lacspace/sdk";

try {
  await lac.ecommerce.checkout("cart_123");
} catch (e) {
  if (e instanceof LacspaceApiError) console.error(e.status, e.body);
}
```

## Re-exports

Everything from `@lacspace/api`, `@lacspace/auth`, and `@lacspace/analytics` is re-exported from this package, so you can import types and classes from one place:

```ts
import { LacspaceSDK, LacspaceApi, LacspaceAuth, LacspaceAnalytics, LacspaceApiError } from "@lacspace/sdk";
import type { Product, LacspaceUser, AnalyticsEvent } from "@lacspace/sdk";
```

## License

MIT © [Lacspace](https://lacspace.com)
