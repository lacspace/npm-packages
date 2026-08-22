<div align="center">

# Lacspace Packages

**Small, sharp, open-source TypeScript packages for building on Lacspace — and for building in Nepal.**

Zero-dependency · isomorphic (Node 18+, browsers, edge, React Native) · dual **ESM + CJS** · fully typed · MIT

[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/~thelacspace)
[![npm org](https://img.shields.io/badge/npm-%40lacspace-%230b76ef)](https://www.npmjs.com/~thelacspace)

</div>

---

## 📦 Packages

### Core SDK — talk to the Lacspace platform

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/sdk`](./sdk) | [![v](https://img.shields.io/npm/v/@lacspace/sdk?label=%20)](https://www.npmjs.com/package/@lacspace/sdk) | **Start here.** api + auth + analytics + e-commerce in one client |
| [`@lacspace/api`](./api) | [![v](https://img.shields.io/npm/v/@lacspace/api?label=%20)](https://www.npmjs.com/package/@lacspace/api) | The zero-dependency HTTP client everything builds on |
| [`@lacspace/auth`](./auth) | [![v](https://img.shields.io/npm/v/@lacspace/auth?label=%20)](https://www.npmjs.com/package/@lacspace/auth) | Login, register, current user, token refresh |
| [`@lacspace/analytics`](./analytics) | [![v](https://img.shields.io/npm/v/@lacspace/analytics?label=%20)](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking with batching + offline queue |

### React

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/react`](./react) | [![v](https://img.shields.io/npm/v/@lacspace/react?label=%20)](https://www.npmjs.com/package/@lacspace/react) | `useAuth`, `useQuery`, `useLacspace` hooks + provider |

### Nepal toolkit — useful to everyone, not just Lacspace

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/nepali-date`](./nepali-date) | [![v](https://img.shields.io/npm/v/@lacspace/nepali-date?label=%20)](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat ↔ Gregorian dates, Nepali formatting |
| [`@lacspace/nepali-utils`](./nepali-utils) | [![v](https://img.shields.io/npm/v/@lacspace/nepali-utils?label=%20)](https://www.npmjs.com/package/@lacspace/nepali-utils) | NPR formatting, amount-in-words, validators, provinces |

## 🚀 30-second example

```bash
npm install @lacspace/sdk
```

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

await lac.auth.login({ email: "you@shop.com", password: "••••••••" });
const products = await lac.ecommerce.getProducts();
await lac.analytics.track("product_viewed", { id: products[0]?.id });
```

And a couple of Nepal helpers, standalone:

```ts
import { NepaliDate } from "@lacspace/nepali-date";
import { formatNPR } from "@lacspace/nepali-utils";

new NepaliDate().formatNepali(); // "२०८३ भदौ ६, शनिबार"
formatNPR(1234567.5);            // "Rs. 12,34,567.50"
```

## ✨ Why these packages

- **Zero runtime dependencies** in the core — built on the platform `fetch`. Tiny installs, clean supply chain.
- **Isomorphic** — one codebase for server, browser, edge and native.
- **Typed & dual-format** — full `.d.ts`, shipped as ESM and CJS with a proper `exports` map.
- **No surprises** — configure in code, no config files written to disk, no import-time side effects.
- **Free & MIT** — use them anywhere, commercial or not.

## 🛠️ Local development

npm-workspaces monorepo built with [tsup](https://tsup.egoist.dev).

```bash
git clone https://github.com/lacspace/npm-packages.git
cd npm-packages
npm install     # links the workspace packages
npm run build   # core: api → auth → analytics → sdk
npm run build:new   # nepali-date, nepali-utils, react
```

## 🌐 Links

- Website → **[lacspace.com/packages](https://lacspace.com/packages)**
- npm → **[npmjs.com/~thelacspace](https://www.npmjs.com/~thelacspace)**

## License

MIT © [Lacspace](https://lacspace.com)
