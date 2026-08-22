# @lacspace/sdk

The high-level TypeScript SDK for Lacspace. Bundles [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api), [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth) and [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics) behind one client that shares a single api instance — so a login token applies to every call — plus e-commerce helpers.

Isomorphic, dual **ESM + CJS**, fully typed.

## Install

```bash
npm install @lacspace/sdk
```

## Usage

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

// Auth (token is applied to the shared client automatically)
const { user } = await lac.auth.login({ email: "you@shop.com", password: "…" });

// E-commerce
const products = await lac.ecommerce.getProducts();
await lac.ecommerce.addToCart({ productId: products[0]!.id, quantity: 1 });
const { orderId } = await lac.ecommerce.checkout("cart-id");

// Analytics
await lac.analytics.track("checkout_completed", { orderId });

// Or drop down to the raw client for any endpoint
const custom = await lac.api.get("some/endpoint");
```

Everything from `@lacspace/api`, `@lacspace/auth`, and `@lacspace/analytics` is also re-exported from this package.

## License

MIT © Lacspace
