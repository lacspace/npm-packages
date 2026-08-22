# @lacspace/auth

[![npm](https://img.shields.io/npm/v/@lacspace/auth.svg)](https://www.npmjs.com/package/@lacspace/auth) [![license](https://img.shields.io/npm/l/@lacspace/auth.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

Authentication flows for Lacspace APIs — login, register, current user, logout, and token refresh. Built on [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api).

When you log in, the returned token is **applied to the client automatically**, so every request after that is authenticated. No manual header juggling.

- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/auth
```

## Quick start

```ts
import { LacspaceAuth } from "@lacspace/auth";

const auth = new LacspaceAuth({ baseURL: "https://api.lacspace.com/api" });

const { token, user } = await auth.login({ email: "you@shop.com", password: "••••••••" });
// `auth` is now authenticated — this works without extra setup:
const me = await auth.me();

await auth.logout();
```

## Register a new user

```ts
const { user } = await auth.register({
  username: "ada",
  email: "ada@shop.com",
  password: "••••••••",
});
```

## Persisting the session

Save the token after login, and restore it when your app starts:

```ts
// after login (browser example)
const { token } = await auth.login({ email, password });
localStorage.setItem("lac_token", token);

// on next app start
const saved = localStorage.getItem("lac_token");
if (saved) auth.setToken(saved);

// keep it fresh
const { token: fresh } = await auth.refresh();
localStorage.setItem("lac_token", fresh);
```

## Share one client across your app

If you also use `@lacspace/api` (or `@lacspace/analytics`) directly, pass a single `api` instance so a login token applies everywhere:

```ts
import { LacspaceApi } from "@lacspace/api";
import { LacspaceAuth } from "@lacspace/auth";

const api = new LacspaceApi({ baseURL: "https://api.lacspace.com/api" });
const auth = new LacspaceAuth({ api });

await auth.login({ email, password });
// `api` is now authenticated too:
const orders = await api.get("orders");
```

> Or just use [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk), which wires this up for you.

## Custom endpoints

Backend routes differ? Override them:

```ts
const auth = new LacspaceAuth({
  baseURL,
  endpoints: {
    login: "v2/sessions",
    register: "v2/users",
    me: "v2/users/me",
  },
});
```

Defaults: `auth/login`, `auth/register`, `auth/me`, `auth/logout`, `auth/refresh`.

## Error handling

Failed calls throw `LacspaceApiError` (re-exported from `@lacspace/api`):

```ts
import { LacspaceApiError } from "@lacspace/api";

try {
  await auth.login({ email, password });
} catch (err) {
  if (err instanceof LacspaceApiError && err.status === 401) {
    showMessage("Wrong email or password.");
  }
}
```

## API reference

- `new LacspaceAuth(options?)` — accepts everything `LacspaceApi` does, plus `api?` and `endpoints?`
- `login(credentials)` → `{ token, user }` (applies the token)
- `register(data)` → `{ token, user }` (applies the token)
- `me()` → the current user
- `logout()` · `refresh()` → `{ token, user }` (applies the token)
- `setToken(token)` · `getToken()`
- `auth.api` — the underlying `LacspaceApi` for any other request

## License

MIT © [Lacspace](https://lacspace.com)
