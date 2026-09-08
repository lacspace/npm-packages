<div align="center">

# @lacspace/react

**React hooks and a provider for the Lacspace SDK — `useAuth`, `useQuery`, `useLacspace`.**

[![npm version](https://img.shields.io/npm/v/@lacspace/react?color=%2338bdf8&label=npm)](https://www.npmjs.com/package/@lacspace/react)
[![install size](https://packagephobia.com/badge?p=@lacspace/react)](https://packagephobia.com/result?p=@lacspace/react)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/react?label=minzip)](https://bundlephobia.com/package/@lacspace/react)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/react)
[![license](https://img.shields.io/npm/l/@lacspace/react?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Wrap your app once, then call the hooks anywhere — all sharing one authenticated SDK client. React 18+.

- 🧩 `<LacspaceProvider>` — one shared `LacspaceSDK` for the whole tree
- 🔐 `useAuth()` — `{ user, loading, error, login, register, logout }`, live-synced to the SDK
- 🔄 `useQuery(fetcher, deps?)` — fetch anything from the SDK with `{ data, loading, error, refetch }`
- ✍️ `useMutation(mutator)` — run writes with `{ mutate, status, data, error, reset }`
- 🚦 `useAuthStatus()` — `"loading" | "authenticated" | "unauthenticated"` in one value
- 🪝 `useLacspace()` — the raw SDK for everything else
- 🧪 A pure, framework-agnostic core (state machine · retry/backoff · polling) you can unit-test without a DOM
- ⚡ Ships `"use client"` · `@lacspace/sdk` + `react` are peer deps · fully typed

> **New in 1.2.0** — `useMutation` and `useAuthStatus` hooks, plus a fully **pure core** (`asyncReducer`, `deriveAuthStatus`, `computeBackoff`, `runWithRetry`, `resolveRefetchInterval`, `serializeDeps`) that has zero React/DOM coupling — testable under plain Node with all timing injectable. Fully backward compatible.

## Install

```bash
npm install @lacspace/react @lacspace/sdk react
```

The package ships the `"use client"` directive, so you can import it directly into a Server Component tree (Next.js App Router).

## Setup

```tsx
import { LacspaceProvider } from "@lacspace/react";

export function App() {
  return (
    <LacspaceProvider options={{ baseURL: "https://api.lacspace.com/api" }}>
      <Routes />
    </LacspaceProvider>
  );
}
```

## `useAuth`

```tsx
import { useAuth } from "@lacspace/react";

function LoginForm() {
  const { login, user, loading, error } = useAuth();

  if (user) return <p>Welcome, {user.username ?? user.email}!</p>;

  return (
    <form onSubmit={(e) => { e.preventDefault();
      const f = new FormData(e.currentTarget);
      login({ email: String(f.get("email")), password: String(f.get("password")) });
    }}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      {error && <p role="alert">{error.message}</p>}
    </form>
  );
}
```

## `useQuery`

Fetch anything from the SDK with loading/error state and `refetch`:

```tsx
import { useQuery } from "@lacspace/react";

function Products() {
  const { data, loading, error, refetch } = useQuery((sdk) => sdk.ecommerce.getProducts());

  if (loading) return <Spinner />;
  if (error)   return <button onClick={refetch}>Retry</button>;
  return <ul>{data!.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}

// Re-run when a dependency changes:
const { data } = useQuery((sdk) => sdk.api.get(`products/${id}`), [id]);
```

## `useMutation`

Run one-off writes (checkout, tracking, profile updates) with managed `status`, `data` and `error`:

```tsx
import { useMutation } from "@lacspace/react";

function CheckoutButton({ cartId }: { cartId: string }) {
  const checkout = useMutation((sdk, id: string) => sdk.ecommerce.checkout(id));

  if (checkout.isSuccess) return <p>Order {checkout.data!.orderId} placed 🎉</p>;

  return (
    <>
      <button disabled={checkout.isLoading} onClick={() => checkout.mutate(cartId)}>
        {checkout.isLoading ? "Placing…" : "Place order"}
      </button>
      {checkout.error && <p role="alert">{checkout.error.message}</p>}
    </>
  );
}
```

`mutate()` never rejects (read `error` for failures); use `mutateAsync()` when you want a
`try/catch` call site. Call `reset()` to return to the idle state.

## `useAuthStatus`

Gate routes on a single value instead of juggling `user` + `loading`:

```tsx
import { useAuthStatus } from "@lacspace/react";

function Guard({ children }: { children: React.ReactNode }) {
  const status = useAuthStatus(); // "loading" | "authenticated" | "unauthenticated"
  if (status === "loading") return <Spinner />;
  if (status === "unauthenticated") return <Redirect to="/login" />;
  return <>{children}</>;
}
```

## Pure core (no React, no DOM)

Everything the hooks are built on is exported as plain functions you can use — and unit-test —
anywhere, with all timing injectable:

```ts
import { computeBackoff, runWithRetry, deriveAuthStatus, serializeDeps } from "@lacspace/react";

// Retry a flaky SDK call with exponential backoff:
const products = await runWithRetry((sdk) => sdk.ecommerce.getProducts(), { retries: 3 });

computeBackoff(2);                              // 4000 (ms)
deriveAuthStatus({ user: null, loading: true }); // "loading"
serializeDeps(["user", { id: 1 }]);             // stable cache key
```

## `useLacspace`

Grab the raw SDK for anything the hooks don't cover:

```tsx
import { useLacspace } from "@lacspace/react";

function BuyButton() {
  const lac = useLacspace();
  return <button onClick={() => lac.analytics.track("cta_clicked")}>Buy</button>;
}
```

## API

| Export | Signature | Returns |
| --- | --- | --- |
| `<LacspaceProvider>` | `{ options?, client?, children }` | provides one shared SDK |
| `useLacspace()` | — | the `LacspaceSDK` instance |
| `useAuth()` | — | `{ user, loading, error, login, register, logout }` |
| `useQuery(fetcher, deps?)` | `(sdk) => Promise<T>` | `{ data, loading, error, refetch }` |
| `useMutation(mutator)` | `(sdk, vars) => Promise<T>` | `{ mutate, mutateAsync, data, error, status, isLoading, isSuccess, isError, isIdle, reset }` |
| `useAuthStatus()` | — | `"loading" \| "authenticated" \| "unauthenticated"` |

### Pure core (framework-agnostic)

| Export | Signature |
| --- | --- |
| `asyncReducer(state, action)` | pure state machine → `AsyncState<T>` |
| `initialAsyncState(seed?)` | `AsyncState<T>` |
| `selectAsyncFlags(state)` | `{ isIdle, isLoading, isSuccess, isError }` |
| `deriveAuthStatus({ user, loading? })` | `AuthStatus` |
| `isAuthenticated(user)` | `boolean` |
| `computeBackoff(attempt, opts?)` | delay in ms |
| `runWithRetry(fn, opts?)` | `Promise<T>` (injectable `sleep`) |
| `resolveRefetchInterval(interval, data, opts?)` | `number \| null` |
| `serializeDeps(deps)` | stable string key |
| `toError(value)` | `Error` |

## The Lacspace family

| Package | For |
| --- | --- |
| **`@lacspace/react`** | React hooks (this package) |
| [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) | Everything in one client |
| [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api) | The core HTTP client |
| [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth) | Login, register, tokens |
| [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking |
| [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat dates |
| [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) | Nepal helpers |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/react` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/react
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

