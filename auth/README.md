<div align="center">

# @lacspace/auth

**Authentication flows for Lacspace APIs — login, register, refresh — with the token applied for you.**

[![npm version](https://img.shields.io/npm/v/@lacspace/auth?color=%230b76ef&label=npm)](https://www.npmjs.com/package/@lacspace/auth)
[![install size](https://packagephobia.com/badge?p=@lacspace/auth)](https://packagephobia.com/result?p=@lacspace/auth)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/auth?label=minzip)](https://bundlephobia.com/package/@lacspace/auth)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/auth)
[![license](https://img.shields.io/npm/l/@lacspace/auth?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Sign a user in and the bearer token is set on the shared client automatically — every request after that just works.

- 🔐 login · register · me · logout · refresh
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/auth      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { LacspaceAuth } from "@lacspace/auth";

const auth = new LacspaceAuth({ baseURL: "https://api.lacspace.com/api" });

const { token, user } = await auth.login({ email: "you@shop.com", password: "••••••••" });
const me = await auth.me();   // already authenticated
await auth.logout();
```

## Recipes

**Register**

```ts
const { user } = await auth.register({ username: "ada", email: "ada@shop.com", password: "••••••••" });
```

**Persist & restore the session**

```ts
// after login
localStorage.setItem("lac_token", token);

// on next app start
const saved = localStorage.getItem("lac_token");
if (saved) auth.setToken(saved);

// keep it fresh
const { token: fresh } = await auth.refresh();
localStorage.setItem("lac_token", fresh);
```

**Share one client across your app** (so auth + your other calls use the same token)

```ts
import { LacspaceApi } from "@lacspace/api";
import { LacspaceAuth } from "@lacspace/auth";

const api = new LacspaceApi({ baseURL: "https://api.lacspace.com/api" });
const auth = new LacspaceAuth({ api });

await auth.login({ email, password });
const orders = await api.get("orders"); // authenticated
```

**Match your backend's routes**

```ts
const auth = new LacspaceAuth({
  baseURL,
  endpoints: { login: "v2/sessions", register: "v2/users", me: "v2/users/me" },
});
```
Defaults: `auth/login`, `auth/register`, `auth/me`, `auth/logout`, `auth/refresh`.

**Show the right error**

```ts
import { LacspaceApiError } from "@lacspace/api";

try {
  await auth.login({ email, password });
} catch (err) {
  if (err instanceof LacspaceApiError && err.status === 401) showMessage("Wrong email or password.");
}
```

## API

`login(credentials)` · `register(data)` · `me()` · `logout()` · `refresh()` · `setToken(t)` · `getToken()` · `auth.api` (the underlying `LacspaceApi`). `login`/`register`/`refresh` return `{ token, user }` and apply the token.

## The Lacspace family

| Package | For |
| --- | --- |
| [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) | Everything in one client |
| [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api) | The core HTTP client |
| **`@lacspace/auth`** | Login, register, tokens (this package) |
| [`@lacspace/analytics`](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking |
| [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) | React hooks |
| [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat dates |
| [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) | Nepal helpers |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
