# @lacspace/react

[![npm](https://img.shields.io/npm/v/@lacspace/react.svg)](https://www.npmjs.com/package/@lacspace/react) [![license](https://img.shields.io/npm/l/@lacspace/react.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

React hooks and a provider for the [Lacspace SDK](https://www.npmjs.com/package/@lacspace/sdk). Wrap your app once, then call `useAuth`, `useQuery`, and `useLacspace` anywhere — all sharing one authenticated client.

Dual ESM + CJS, fully typed. Requires React 18+.

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    await login({ email: String(form.get("email")), password: String(form.get("password")) });
  }

  if (user) return <p>Welcome, {user.username ?? user.email}!</p>;

  return (
    <form onSubmit={onSubmit}>
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
  if (error) return <button onClick={refetch}>Retry</button>;
  return <ul>{data!.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

Pass dependencies to re-run when they change:

```tsx
const { data } = useQuery((sdk) => sdk.api.get(`products/${id}`), [id]);
```

## `useLacspace`

Grab the raw SDK for anything the hooks don't cover:

```tsx
import { useLacspace } from "@lacspace/react";

function TrackButton() {
  const lac = useLacspace();
  return <button onClick={() => lac.analytics.track("cta_clicked")}>Buy</button>;
}
```

## API

- `<LacspaceProvider options={…} | client={…}>` — provides one shared SDK
- `useLacspace()` → the `LacspaceSDK` instance
- `useAuth()` → `{ user, loading, error, login, register, logout }`
- `useQuery(fetcher, deps?)` → `{ data, loading, error, refetch }`

## License

MIT © [Lacspace](https://lacspace.com)
