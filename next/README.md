<div align="center">

# @lacspace/next

**Next.js App Router integration for the Lacspace SDK — the server-side companion to `@lacspace/react`.**

[![npm version](https://img.shields.io/npm/v/@lacspace/next?color=%230ea5e9&label=npm)](https://www.npmjs.com/package/@lacspace/next)
[![install size](https://packagephobia.com/badge?p=@lacspace/next)](https://packagephobia.com/result?p=@lacspace/next)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/next?label=minzip)](https://bundlephobia.com/package/@lacspace/next)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/next)
[![license](https://img.shields.io/npm/l/@lacspace/next?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> An authenticated SDK client that reads the session cookie inside Server Components, Route Handlers and Server Actions — plus wrappers that JSON-serialize handlers, cookie helpers for sign-in/out, and a one-line `middleware.ts` auth guard.

- 🔑 `createServerClient()` — SDK with the auth token applied from cookies
- 🧵 `routeHandler()` / `withAuth()` — clean Route Handlers with JSON errors + auth
- 🍪 `setAuthCookie()` / `clearAuthCookie()` — httpOnly session cookies
- 🛡️ `authGuard()` — protect routes from `middleware.ts`
- 🟢 Next.js 14 & 15 (App Router) · built on [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk)

## Install

```bash
npm install @lacspace/next      # next is a peer dependency
```

## Authenticated client (Server Component / Action)

```ts
import { createServerClient } from "@lacspace/next";

export default async function DashboardPage() {
  const lac = await createServerClient({ baseURL: "https://api.lacspace.com/api" });
  const products = await lac.ecommerce.getProducts(); // token applied from the cookie
  return <ProductGrid products={products} />;
}
```

## Route Handlers

```ts
// app/api/products/route.ts
import { routeHandler, withAuth, createServerClient } from "@lacspace/next";

export const GET = routeHandler(async () => {
  const lac = await createServerClient();
  return lac.ecommerce.getProducts(); // auto JSON; thrown errors → JSON error response
});

// Protected — 401 unless the auth cookie is present
export const POST = withAuth(async (req, _ctx, token) => {
  const body = await req.json();
  return { created: true };
});
```

> ⚠️ **`withAuth` without `verifyToken` only checks cookie _presence_, not
> validity.** On its own that is **not authentication** — any request carrying an
> arbitrary cookie value passes. For anything guarding real data or actions,
> always pass a `verifyToken` that verifies the token (JWT signature + expiry,
> `auth.me()`, a session lookup, …):
>
> ```ts
> export const POST = withAuth(handler, {
>   verifyToken: async (token) => (await verifyJwt(token)) !== null,
> });
> ```

## Sign in / out

```ts
"use server";
import { setAuthCookie, clearAuthCookie, createServerClient } from "@lacspace/next";

export async function login(email: string, password: string) {
  const lac = await createServerClient();
  const { token } = await lac.auth.login({ email, password });
  await setAuthCookie(token);
}

export async function logout() {
  await clearAuthCookie();
}
```

## Middleware guard

```ts
// middleware.ts
import { authGuard } from "@lacspace/next";
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  return authGuard(req, { publicPaths: ["/login", "/api/public", "/_next"] }) ?? NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|favicon.ico).*)"] };
```

## API

| Export | Description |
| --- | --- |
| `createServerClient(opts?)` | SDK authed from the cookie |
| `serverActionClient` | alias for Server Actions |
| `getAuthToken(cookie?)` | read the raw token |
| `setAuthCookie` / `clearAuthCookie` | manage the session cookie |
| `routeHandler(fn)` / `withAuth(fn)` | Route Handler wrappers |
| `authGuard(req, opts?)` | middleware protection |
| `setCsrfCookie` / `getCsrfToken` / `verifyCsrf` / `withCsrf` | CSRF double-submit protection |
| **Pure helpers** (edge-safe, no `next`/`react`) | |
| `serializeCookie(name, value, opts?)` | build a `Set-Cookie` value |
| `parseCookieHeader(header)` / `getCookieValue(header, name)` | read a `Cookie` header |
| `cacheControl(opts)` | build a `Cache-Control` value |
| `matchPath(path, pattern)` / `matchesAny` / `createPathMatcher(patterns)` | route matching (`:param`, `*`, `**`, RegExp) |
| `isSafeRedirectPath(target)` / `sanitizeRedirect(target, fallback?)` | open-redirect-safe `?next=` |
| `extractBearerToken(authHeader)` | parse `Authorization: Bearer` |
| `generateCsrfToken(bytes?)` / `timingSafeStringEqual(a, b)` | CSPRNG token + constant-time compare |
| `statusFromError(err)` / `errorPayload(err, fallback?)` | JSON error shaping |
| `parseSearchParams(input)` | query string → object (arrays for repeats) |

> Client-side hooks (`useAuth`, `useQuery`) live in [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) — use both together.

## The Lacspace WebKit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) | Typed env variables |
| [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) | Rate limiting |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| **`@lacspace/next`** | Next.js SDK integration (this package) |

## New in 1.2.0 — edge-safe cookie, cache & routing utilities

A set of **pure, dependency-free** helpers that don't import `next/*` or `react`,
so they run anywhere (Edge runtime, workers, plain Node) and are trivial to unit
test. Great for `middleware.ts`, custom Route Handlers, and open-redirect-safe
sign-in flows.

```ts
import {
  serializeCookie, parseCookieHeader, getCookieValue,
  cacheControl, matchPath, createPathMatcher,
  isSafeRedirectPath, sanitizeRedirect, extractBearerToken,
  generateCsrfToken, timingSafeStringEqual, parseSearchParams,
} from "@lacspace/next";

// Cookies — build a Set-Cookie value / read a Cookie header
serializeCookie("sid", "abc", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600 });
// "sid=abc; Max-Age=3600; HttpOnly; Secure; SameSite=Lax"
getCookieValue(req.headers.get("cookie"), "sid");           // "abc"

// Cache-Control header from options
cacheControl({ public: true, maxAge: 60, staleWhileRevalidate: 30 });
// "public, max-age=60, stale-while-revalidate=30"

// Route matching (`:param`, `*` within a segment, `**` across segments, or RegExp)
const isPublic = createPathMatcher(["/login", "/api/public/**", /^\/health$/]);
isPublic("/api/public/ping"); // true

// Open-redirect-safe `?next=` handling
sanitizeRedirect(req.nextUrl.searchParams.get("next"), "/dashboard"); // rejects //evil.com, https://…

// Bearer tokens + constant-time compare
extractBearerToken(req.headers.get("authorization")); // "eyJ…" | undefined
timingSafeStringEqual(a, b);
```

## New in 1.2 — CSRF & token validation

```ts
import { setCsrfCookie, withCsrf, withAuth } from "@lacspace/next";

// Issue a CSRF token (readable cookie) in a GET/layout; client echoes it back
export const GET = async () => Response.json({ csrf: await setCsrfCookie() });

// Reject unsafe methods that fail the double-submit check
export const POST = withCsrf(async (req) => doWrite(await req.json()));

// withAuth now validates the token, not just its presence
export const GET_me = withAuth(
  (req, ctx, token) => getUser(token),
  { verifyToken: async (t) => (await isValidJwt(t)) },  // reject expired/forged
);
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/next` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/next
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

