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

> **New in 2.1.0** — a transport-agnostic, spec-style `AnalyticsClient` with the
> full `track` / `identify` / `page` / `screen` / `group` / `alias` surface, a
> consistent event envelope, size/interval **batching**, an **offline buffer with
> backoff retry**, **consent + Do-Not-Track** gating, and pluggable **middleware**
> plus **UTM** and **session** helpers. Every side-effect (transport, clock,
> timers) is injectable, so it never touches the network by default. All
> additive — the `LacspaceAnalytics` class above is unchanged.

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

## Spec-style client (new in 2.1.0)

A framework-agnostic client with the full analytics surface and a consistent
envelope. Point it at your own `transport` (default: a no-op) — the client never
hits the network on its own, so it's trivial to test.

```ts
import { createAnalyticsClient, createMemoryTransport } from "@lacspace/analytics";

const mem = createMemoryTransport();                 // collect in memory (or your own fn)
const a = createAnalyticsClient({
  transport: mem.transport,
  consent: true,          // required to collect; respects Do-Not-Track by default
  flushAt: 20,            // flush once 20 events are buffered
  flushInterval: 10_000,  // …or every 10s
});

a.identify("u_1", { plan: "pro" });
a.track("product_viewed", { id: "p_1", price: 499 });
a.page("Pricing", { path: "/pricing" });
await a.flush(); // one batch → transport
```

Offline events aren't lost — a failed `transport` re-buffers them (capped at
`maxQueueSize`) and retries with backoff. Turn consent off and events are dropped
(or held with `whenBlocked: "hold"`).

**Enrichment**

```ts
import { parseUtm, createSession } from "@lacspace/analytics";

const campaign = parseUtm(location.href);            // { source, medium, name, term, content }
const session = createSession({ timeout: 30 * 60_000 });
const a = createAnalyticsClient({
  transport,
  consent: true,
  context: { campaign, sessionId: session.id() },
  middleware: [(e) => { if (e.properties?.email) e.properties.email = "[redacted]"; return e; }],
});
```

### New API

| Export | What it does |
| --- | --- |
| `AnalyticsClient` / `createAnalyticsClient(opts?)` | Spec-style client: `track` · `identify` · `page` · `screen` · `group` · `alias` · `flush` · `setConsent` · `close`; getters `queued` · `enabled` · `userId` · `anonymousId` |
| `createMemoryTransport()` | Collecting transport (`.events`, `.batches`) for tests/dev |
| `shouldTrack(ctx)` · `detectDNT()` | Pure consent decision + browser DNT read |
| `parseUtm(url)` / `parseCampaign(url)` | UTM / campaign params → `Campaign` |
| `createSession(opts?)` | Session id that renews after an inactivity `timeout` |
| `applyMiddleware(event, chain)` | Run an event through a `Middleware[]` (return `null` to drop) |

Injectables on `AnalyticsClientOptions`: `transport`, `now`, `setTimer`/`clearTimer`, `genId`, `flushAt`, `flushInterval`, `maxQueueSize`, `maxRetries`, `backoff`, `consent`, `respectDNT`, `dnt`, `defaultConsent`, `whenBlocked`, `context`, `middleware`, `anonymousId`.

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

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/analytics` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/analytics
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

