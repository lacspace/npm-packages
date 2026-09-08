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
| `head/options<T>(path, opts?)` | `HEAD` / `OPTIONS` (default `responseType: "response"`) |
| `request<T>(method, path, body?, init?)` | low-level escape hatch |
| `paginate<T>` · `getAll<T>` | page-number pagination |
| `paginateCursor<T>` · `getAllCursor<T>` | cursor pagination (`nextCursor`/`next_cursor`/`cursor`) |
| `setToken(t)` · `getToken()` | manage the bearer token |
| `createApi(opts?)` | factory for `new LacspaceApi(opts)` |
| `LacspaceApiError` · `isApiError(e)` | error type + type guard |
| `buildQuery(params, opts?)` · `parseQuery(str)` | typed query strings (`repeat`/`comma`/`brackets`) |
| `joinUrl(base, …parts)` · `joinPath(…parts)` · `withQuery(url, params)` | URL / path joining |
| `normalizeHeaders(init)` · `mergeHeaders(…sources)` | case-insensitive header records |
| `formBody(obj)` | `application/x-www-form-urlencoded` body |
| `getStatus` · `getErrorBody<T>` · `isStatus` · `isClientError` · `isServerError` · `isNotFound` · `isUnauthorized` · `isForbidden` · `isConflict` · `isRateLimited` · `retryAfterMs` | typed error helpers |

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

## New in 2.1 — batteries included

```ts
import { createApi, isApiError } from "@lacspace/api";

const api = createApi({
  baseURL: "https://api.example.com",
  timeoutMs: 8000,
  retries: 3, // retries 408/425/429/5xx with backoff + honours Retry-After
});

// query params (arrays repeat the key; undefined/null dropped) + typed response
const users = await api.get("/users", { params: { page: 1, tags: ["a", "b"] } });

// interceptors — auth refresh, logging, tracing, all in one place
api.interceptors.request((ctx) => { ctx.init.headers["x-trace"] = crypto.randomUUID(); return ctx; });
api.interceptors.error((err) => { if (isApiError(err)) report(err.status); });

// pagination — async-iterate or collect
for await (const u of api.paginate("/users")) handle(u);
const everyone = await api.getAll("/users");

// non-JSON bodies & response types
await api.post("/upload", formData);              // FormData passes through untouched
const pdf = await api.get("/report.pdf", { responseType: "blob" });
```

Also: per-request `timeoutMs`/`AbortSignal`, in-flight de-duplication of concurrent GETs, opt-in `cacheTtlMs`, and `isApiError()` for clean `catch` blocks. Everything is additive — existing calls keep working.

## New in 2.2.0 — helpers & cursor pagination

All additive and dependency-free. Nothing about the client, its options, defaults, or error shape changed.

```ts
import {
  createApi, joinUrl, withQuery, buildQuery, parseQuery,
  mergeHeaders, formBody, isNotFound, isRateLimited, retryAfterMs, getErrorBody,
} from "@lacspace/api";

const api = createApi({ baseURL: "https://api.example.com" });

// New verbs — HEAD & OPTIONS (default to the raw Response so you can read headers)
const head = await api.head("reports/42");
console.log(head.headers.get("etag"));

// Cursor pagination — async-iterate or collect (reads nextCursor / next_cursor / cursor)
for await (const row of api.paginateCursor("feed")) handle(row);
const everything = await api.getAllCursor("feed");

// URL & query helpers
joinUrl("https://api.x.com/", "/v2/", "users");     // "https://api.x.com/v2/users"
withQuery("/users?active=1", { page: 2 });          // "/users?active=1&page=2"
buildQuery({ tags: ["a", "b"] }, { arrayFormat: "comma" }); // "tags=a%2Cb"
parseQuery("tags=a&tags=b");                         // { tags: ["a", "b"] }

// Header merging (case-insensitive, last wins) & form bodies
mergeHeaders({ "Content-Type": "text/plain" }, { "content-type": "application/json" });
await api.post("login", formBody({ email, password })); // x-www-form-urlencoded

// Typed error helpers — no instanceof gymnastics
try {
  await api.get("users/me");
} catch (e) {
  if (isNotFound(e)) return null;
  if (isRateLimited(e)) await wait(retryAfterMs(e) ?? 1000);
  const problem = getErrorBody<{ message: string }>(e);
}
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/api` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/api
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

