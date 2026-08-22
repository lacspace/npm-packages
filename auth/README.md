# @lacspace/auth

Authentication flows for Lacspace APIs, built on [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api). Handles login, registration, current user, logout, and token refresh — and keeps the bearer token on the shared api client so every subsequent request is authenticated.

Isomorphic, dual **ESM + CJS**, fully typed.

## Install

```bash
npm install @lacspace/auth
```

## Usage

```ts
import { LacspaceAuth } from "@lacspace/auth";

const auth = new LacspaceAuth({ baseURL: "https://api.lacspace.com/api" });

const { token, user } = await auth.login({ email: "you@shop.com", password: "…" });
const me = await auth.me();
await auth.logout();
```

Reuse an existing api client so auth and your other calls share one token:

```ts
import { LacspaceApi } from "@lacspace/api";
import { LacspaceAuth } from "@lacspace/auth";

const api = new LacspaceApi({ baseURL: "https://api.lacspace.com/api" });
const auth = new LacspaceAuth({ api });

await auth.login({ email, password }); // now `api` is authenticated too
```

Override endpoint paths to match your backend via `options.endpoints`.

## License

MIT © Lacspace
