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

> Client-side hooks (`useAuth`, `useQuery`) live in [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) — use both together.

## The Lacspace WebKit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) | Typed env variables |
| [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) | Rate limiting |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| **`@lacspace/next`** | Next.js SDK integration (this package) |

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

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
