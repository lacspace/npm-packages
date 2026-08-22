# @lacspace/analytics

[![npm](https://img.shields.io/npm/v/@lacspace/analytics.svg)](https://www.npmjs.com/package/@lacspace/analytics) [![license](https://img.shields.io/npm/l/@lacspace/analytics.svg)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

Event tracking for Lacspace platforms. Send events one at a time, or **queue them and flush in a single batch** — handy for reducing requests and for offline-first apps. Built on [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api).

- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/analytics
```

## Quick start

```ts
import { LacspaceAnalytics } from "@lacspace/analytics";

const analytics = new LacspaceAnalytics({ baseURL: "https://api.lacspace.com/api" });

// Send one event right away
await analytics.track("product_viewed", { id: "p_123", price: 499 });
```

## Batching with the queue

Collect events cheaply (no network), then send them all at once:

```ts
analytics.queueEvent("page_view", { path: "/tea" });
analytics.queueEvent("scroll", { depth: 0.5 });
analytics.queueEvent("add_to_cart", { id: "p_123" });

console.log(analytics.pending); // 3

await analytics.flush(); // one batched request; queue is cleared
```

A common pattern — flush periodically and before the page unloads:

```ts
setInterval(() => analytics.flush(), 10_000);
window.addEventListener("beforeunload", () => analytics.flush());
```

## Send an explicit batch

```ts
await analytics.batch([
  { name: "signup", data: { plan: "free" } },
  { name: "invite_sent", data: { count: 3 } },
]);
```

## Share one client (authenticated events)

Reuse an authenticated `api` instance so events are tied to the logged-in user:

```ts
import { LacspaceApi } from "@lacspace/api";
import { LacspaceAnalytics } from "@lacspace/analytics";

const api = new LacspaceApi({ baseURL, apiKey: userToken });
const analytics = new LacspaceAnalytics({ api });
```

> Using [`@lacspace/sdk`](https://www.npmjs.com/package/@lacspace/sdk)? It exposes this as `sdk.analytics` with the shared client already wired up.

## Custom endpoints

```ts
const analytics = new LacspaceAnalytics({
  baseURL,
  endpoints: { track: "v2/events", batch: "v2/events/batch" },
});
```

Defaults: `analytics/events` (single) and `analytics/batch` (batch).

## API reference

- `new LacspaceAnalytics(options?)` — accepts everything `LacspaceApi` does, plus `api?` and `endpoints?`
- `track(name, data?)` → sends one event immediately
- `queueEvent(name, data?)` → adds to the in-memory queue (chainable)
- `flush()` → sends the whole queue as one batch, then clears it
- `batch(events)` → sends an explicit array of events
- `pending` → number of queued events
- `analytics.api` — the underlying `LacspaceApi`

Every event is stamped with a `ts` (epoch ms) automatically.

## License

MIT © [Lacspace](https://lacspace.com)
