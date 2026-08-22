# @lacspace/api

[![npm](https://img.shields.io/npm/v/@lacspace/api.svg)](https://www.npmjs.com/package/@lacspace/api) [![license](https://img.shields.io/npm/l/@lacspace/api.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

The core HTTP client for Lacspace APIs — and the foundation the other `@lacspace` packages build on.

- ⚡ **Zero dependencies** — built on the platform `fetch`
- 🌍 **Isomorphic** — Node 18+, browsers, edge, React Native, any bundler
- 📦 **Dual ESM + CJS** with full TypeScript types
- 🎯 **Typed responses** — `get<Product[]>()` returns `Product[]`
- 🧯 **Predictable errors** — non-2xx throws `LacspaceApiError`

## Install

```bash
npm install @lacspace/api
# pnpm add @lacspace/api · yarn add @lacspace/api · bun add @lacspace/api
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

## Configuring

Pass options directly:

```ts
const api = new LacspaceApi({
  baseURL: "https://api.lacspace.com/api", // required
  apiKey: "your-token",                    // optional — sent as `Authorization: Bearer …`
  headers: { "X-App": "storefront" },      // optional — merged into every request
});
```

…or set environment variables and construct with no arguments:

```bash
LACSPACE_API_URL=https://api.lacspace.com/api
LACSPACE_API_KEY=your-token
```

```ts
const api = new LacspaceApi(); // reads LACSPACE_API_URL / LACSPACE_API_KEY
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `baseURL` | `string` | `LACSPACE_API_URL` | **Required** (via option or env). |
| `apiKey` | `string` | `LACSPACE_API_KEY` | Sent as a Bearer token when present. |
| `headers` | `Record<string,string>` | `{}` | Merged into every request. |
| `fetch` | `typeof fetch` | global `fetch` | Provide one for Node < 18 or tests. |

## Making requests

```ts
// GET
const user = await api.get<User>("users/me");

// POST with a JSON body
const order = await api.post<Order>("orders", { productId: "p_1", qty: 2 });

// PUT / PATCH / DELETE
await api.put<User>("users/me", { name: "Ada" });
await api.patch<User>("users/me", { name: "Ada" });
await api.delete<void>("orders/o_1");

// Per-request options (query string, signal, extra headers…)
const results = await api.get<Product[]>("products?category=tea", {
  signal: AbortSignal.timeout(5000),
  headers: { "X-Trace": "abc" },
});

// Escape hatch for any method
await api.request<Blob>("HEAD", "health");
```

Every method returns the parsed JSON body, typed as whatever you pass in `<T>`.

## Auth tokens at runtime

```ts
const api = new LacspaceApi({ baseURL });

api.setToken("token-from-login"); // apply a token later
api.getToken();                   // read the current token
```

## Error handling

Any non-2xx response throws a `LacspaceApiError`:

```ts
import { LacspaceApi, LacspaceApiError } from "@lacspace/api";

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

## API reference

- `new LacspaceApi(options?)`
- `get<T>(path, init?)` · `post<T>(path, body?, init?)` · `put<T>(...)` · `patch<T>(...)` · `delete<T>(path, init?)`
- `request<T>(method, path, body?, init?)` — low-level
- `setToken(token)` · `getToken()`
- `createApi(options?)` — factory equivalent to `new LacspaceApi(options)`
- `LacspaceApiError` — `{ status, statusText, body }`

> `init` accepts anything the standard `fetch` `RequestInit` does (`signal`, `headers`, `cache`, …).

## Related

Part of the [Lacspace packages](https://github.com/lacspace/npm-packages) family — see [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth), [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics), and [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk).

## License

MIT © [Lacspace](https://lacspace.com)
