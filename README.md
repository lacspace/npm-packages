# Lacspace Packages

Open-source TypeScript packages for building on Lacspace platforms. Zero-dependency, isomorphic (works in Node 18+, browsers, edge, and bundlers), shipped as dual **ESM + CJS** with full type definitions.

| Package | Description |
| --- | --- |
| [`@lacspace/api`](./api) | Lightweight isomorphic HTTP client — the foundation for the others. |
| [`@lacspace/auth`](./auth) | Authentication flows (login, register, token, refresh) on top of `@lacspace/api`. |
| [`@lacspace/analytics`](./analytics) | Event tracking with batching and an offline queue. |
| [`@lacspace/sdk`](./sdk) | High-level SDK bundling api + auth + analytics + e-commerce helpers. |

## Quick start

```bash
npm install @lacspace/sdk
```

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

const { token } = await lac.auth.login({ email: "you@shop.com", password: "…" });
const products = await lac.ecommerce.getProducts();
await lac.analytics.track("product_viewed", { id: products[0]?.id });
```

Configuration is passed **in code** — no interactive prompts, no config files written to disk. You can also set `LACSPACE_API_URL` / `LACSPACE_API_KEY` environment variables and construct with no arguments.

## Development (monorepo)

This is an npm-workspaces monorepo built with [tsup](https://tsup.egoist.dev).

```bash
npm install       # links the workspace packages
npm run build     # builds api → auth → analytics → sdk (dependency order)
```

## License

MIT © Lacspace
