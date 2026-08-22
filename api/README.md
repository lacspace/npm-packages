# @lacspace/api

Lightweight, **zero-dependency**, isomorphic HTTP client for Lacspace APIs. Built on the platform `fetch`, so it runs in Node 18+, browsers, edge runtimes, and bundlers. Ships dual **ESM + CJS** with full types.

## Install

```bash
npm install @lacspace/api
```

## Usage

```ts
import { LacspaceApi } from "@lacspace/api";

const api = new LacspaceApi({
  baseURL: "https://api.lacspace.com/api",
  apiKey: "your-token", // optional
});

const products = await api.get<Product[]>("products");
const created = await api.post<Order>("orders", { productId: "abc", qty: 2 });
```

Or configure from the environment (`LACSPACE_API_URL`, `LACSPACE_API_KEY`) and construct with no arguments:

```ts
const api = new LacspaceApi();
```

## API

- `new LacspaceApi(options)` — `{ baseURL?, apiKey?, headers?, fetch? }`
- `get<T>(path, init?)`, `post<T>(path, body?, init?)`, `put`, `patch`, `delete`
- `request<T>(method, path, body?, init?)` — low-level escape hatch
- `setToken(token)` / `getToken()` — manage the bearer token at runtime
- Non-2xx responses throw `LacspaceApiError` (`{ status, statusText, body }`)

## License

MIT © Lacspace
