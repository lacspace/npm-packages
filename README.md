# Lacspace Packages

Official open-source TypeScript packages for building on Lacspace platforms.

Every package is **zero-dependency**, **isomorphic** (runs in Node 18+, browsers, edge runtimes, and any bundler), and shipped as dual **ESM + CommonJS** with complete type definitions.

| Package | What it does | npm |
| --- | --- | --- |
| [`@lacspace/api`](./api) | The core HTTP client every other package is built on. | [![npm](https://img.shields.io/npm/v/@lacspace/api.svg)](https://www.npmjs.com/package/@lacspace/api) |
| [`@lacspace/auth`](./auth) | Login, register, current user, logout, token refresh. | [![npm](https://img.shields.io/npm/v/@lacspace/auth.svg)](https://www.npmjs.com/package/@lacspace/auth) |
| [`@lacspace/analytics`](./analytics) | Track events, with batching and an offline queue. | [![npm](https://img.shields.io/npm/v/@lacspace/analytics.svg)](https://www.npmjs.com/package/@lacspace/analytics) |
| [`@lacspace/sdk`](./sdk) | Everything above in one client, plus e-commerce helpers. | [![npm](https://img.shields.io/npm/v/@lacspace/sdk.svg)](https://www.npmjs.com/package/@lacspace/sdk) |

## Which one do I install?

- **Just want everything?** → [`@lacspace/sdk`](./sdk) (it bundles the other three).
- **Only need to call the API?** → [`@lacspace/api`](./api).
- **Building your own auth screen?** → [`@lacspace/auth`](./auth).
- **Only tracking events?** → [`@lacspace/analytics`](./analytics).

## 30-second example

```bash
npm install @lacspace/sdk
```

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

// Log in — the token is stored and reused automatically
await lac.auth.login({ email: "you@shop.com", password: "••••••••" });

// Call the API
const products = await lac.ecommerce.getProducts();

// Track an event
await lac.analytics.track("product_viewed", { id: products[0]?.id });
```

That's the whole idea: **configure once, in code**. No config files written to your disk, no interactive prompts, no setup step.

## Design principles

- **Zero runtime dependencies.** Built on the platform `fetch`. Your `node_modules` stays tiny.
- **Isomorphic.** The same code runs on a server, in a browser, on the edge, or in a React Native app.
- **Typed end-to-end.** Every method is generic — `api.get<Product[]>("products")` returns `Product[]`.
- **Predictable errors.** Any non-2xx response throws a `LacspaceApiError` with the status and parsed body.
- **No magic.** No globals, no import-time side effects, no files written behind your back.

## Contributing / local development

This is an npm-workspaces monorepo built with [tsup](https://tsup.egoist.dev).

```bash
git clone https://github.com/lacspace/npm-packages.git
cd npm-packages
npm install        # links the workspace packages together
npm run build      # builds api → auth → analytics → sdk (in dependency order)
```

## License

MIT © [Lacspace](https://lacspace.com)
