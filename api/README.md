<div align="center">

# @lacspace/api

**The tiny, typed HTTP client for Lacspace APIs — built on `fetch`, runs everywhere.**

[![npm version](https://img.shields.io/npm/v/@lacspace/api?color=%230b76ef&label=npm)](https://www.npmjs.com/package/@lacspace/api)
[![install size](https://packagephobia.com/badge?p=@lacspace/api)](https://packagephobia.com/result?p=@lacspace/api)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/api?label=minzip)](https://bundlephobia.com/package/@lacspace/api)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/api)
[![license](https://img.shields.io/npm/l/@lacspace/api?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The foundation the whole `@lacspace` family is built on. If you only need to call the API, this is all you need.

- ⚡ **Zero dependencies** — nothing but the platform `fetch`
- 🌍 **Isomorphic** — Node 18+, browsers, edge, React Native, any bundler
- 🧠 **Typed responses** — `api.get<Product[]>()` gives you back `Product[]`
- 🧯 **Predictable errors** — every non-2xx throws a `LacspaceApiError`
- 📦 **Dual ESM + CJS** with a proper `exports` map

## Install

```bash
npm  install @lacspace/api      # npm
pnpm add     @lacspace/api      # pnpm
yarn add     @lacspace/api      # yarn
bun  add     @lacspace/api      # bun
```

## Quick start

```ts
import { LacspaceApi } from "@lacspace/api";

const api = new LacspaceApi({
  baseURL: "https://api.lacspace.com/api",
  apiKey: "your-token", // optional
});

const products = await api.get<Product[]>("products");
```

Prefer env vars? Set `LACSPACE_API_URL` / `LACSPACE_API_KEY` and construct with nothing:

```ts
const api = new LacspaceApi();
```

## Recipes

**All the verbs, fully typed**

```ts
const user   = await api.get<User>("users/me");
const order  = await api.post<Order>("orders", { productId: "p_1", qty: 2 });
await api.put<User>("users/me", { name: "Ada" });
await api.patch<User>("users/me", { name: "Ada" });
await api.delete<void>("orders/o_1");
```

**Query strings, timeouts & signals** — the third arg is a standard `fetch` `RequestInit`

```ts
const results = await api.get<Product[]>("products?category=tea", {
  signal: AbortSignal.timeout(5000),
  headers: { "X-Trace": "abc" },
});
```

**Set the token after login**

```ts
const api = new LacspaceApi({ baseURL });
api.setToken(tokenFromLogin); // every later request is now authenticated
```

**Handle errors precisely**

```ts
import { LacspaceApiError } from "@lacspace/api";

try {
  await api.get("does-not-exist");
} catch (err) {
  if (err instanceof LacspaceApiError) {
    console.error(err.status);     // 404
    console.error(err.statusText); // "Not Found"
    console.error(err.body);       // parsed JSON error body (or raw text)
  }
}
```

## API

| Member | Description |
| --- | --- |
| `new LacspaceApi(opts?)` | `{ baseURL?, apiKey?, headers?, fetch? }` |
| `get/post/put/patch/delete<T>(path, …)` | typed requests |
| `request<T>(method, path, body?, init?)` | low-level escape hatch |
| `setToken(t)` · `getToken()` | manage the bearer token |
| `createApi(opts?)` | factory for `new LacspaceApi(opts)` |
| `LacspaceApiError` | `{ status, statusText, body }` |

## The Lacspace family

| Package | For |
| --- | --- |
| [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) | Everything below in one client |
| **`@lacspace/api`** | The core HTTP client (this package) |
| [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth) | Login, register, tokens |
| [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking |
| [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) | React hooks |
| [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat dates |
| [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) | Nepal helpers |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
