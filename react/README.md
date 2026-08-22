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

## Install

```bash
npm install @lacspace/react @lacspace/sdk react
```

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

- `<LacspaceProvider options={…} | client={…}>` — provides one shared SDK
- `useLacspace()` → the `LacspaceSDK` instance
- `useAuth()` → `{ user, loading, error, login, register, logout }`
- `useQuery(fetcher, deps?)` → `{ data, loading, error, refetch }`

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

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
