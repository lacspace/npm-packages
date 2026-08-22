<div align="center">

# @lacspace/analytics

**Event tracking for Lacspace platforms — fire instantly, or queue and flush in one batch.**

[![npm version](https://img.shields.io/npm/v/@lacspace/analytics?color=%230b76ef&label=npm)](https://www.npmjs.com/package/@lacspace/analytics)
[![install size](https://packagephobia.com/badge?p=@lacspace/analytics)](https://packagephobia.com/result?p=@lacspace/analytics)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/analytics?label=minzip)](https://bundlephobia.com/package/@lacspace/analytics)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/analytics)
[![license](https://img.shields.io/npm/l/@lacspace/analytics?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Track one event at a time, or batch many into a single request — great for offline-first apps and cutting network chatter.

- 📊 `track` · `queueEvent` · `flush` · `batch`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/analytics      # or pnpm add / yarn add / bun add
```

## Quick start

```ts
import { LacspaceAnalytics } from "@lacspace/analytics";

const analytics = new LacspaceAnalytics({ baseURL: "https://api.lacspace.com/api" });

await analytics.track("product_viewed", { id: "p_123", price: 499 });
```

## Recipes

**Batch cheaply, send once**

```ts
analytics.queueEvent("page_view", { path: "/tea" });
analytics.queueEvent("scroll", { depth: 0.5 });
analytics.queueEvent("add_to_cart", { id: "p_123" });

analytics.pending;   // 3
await analytics.flush(); // one request, queue cleared
```

**Flush on a timer and before the page unloads**

```ts
setInterval(() => analytics.flush(), 10_000);
window.addEventListener("beforeunload", () => analytics.flush());
```

**Send an explicit batch**

```ts
await analytics.batch([
  { name: "signup", data: { plan: "free" } },
  { name: "invite_sent", data: { count: 3 } },
]);
```

**Tie events to the signed-in user** — reuse an authenticated client

```ts
import { LacspaceApi } from "@lacspace/api";
const api = new LacspaceApi({ baseURL, apiKey: userToken });
const analytics = new LacspaceAnalytics({ api });
```

> With [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) this is `sdk.analytics`, already wired to your session.

## API

`track(name, data?)` · `queueEvent(name, data?)` (chainable) · `flush()` · `batch(events)` · `pending` · `analytics.api`. Every event is stamped with a `ts` (epoch ms). Custom routes via `endpoints: { track, batch }`.

## The Lacspace family

| Package | For |
| --- | --- |
| [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk) | Everything in one client |
| [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api) | The core HTTP client |
| [`@lacspace/auth`](https://www.npmjs.com/package/@lacspace/auth) | Login, register, tokens |
| **`@lacspace/analytics`** | Event tracking (this package) |
| [`@lacspace/react`](https://www.npmjs.com/package/@lacspace/react) | React hooks |
| [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat dates |
| [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) | Nepal helpers |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
