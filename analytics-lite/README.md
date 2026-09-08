<div align="center">

# @lacspace/analytics-lite

**Cookieless, privacy-first web analytics — to your own endpoint. No consent banner.**

[![npm version](https://img.shields.io/npm/v/@lacspace/analytics-lite?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/analytics-lite)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/analytics-lite?label=minzip)](https://bundlephobia.com/package/@lacspace/analytics-lite)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/analytics-lite)
[![license](https://img.shields.io/npm/l/@lacspace/analytics-lite?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Page views and custom events, sent to a URL **you** control. No cookies, no `localStorage` identifiers, no cross-site tracking, no fingerprinting — so in most places you don't need a consent banner. Respects Do-Not-Track, auto-tracks SPA navigation, and uses `sendBeacon` so events survive page unload.

> **New in 1.1.0** — a tiny, fully-injectable toolkit alongside `createAnalytics` (everything below is additive; nothing changed): a batching `LiteClient` (`track`/`page`, flush at size/interval/unload), an injectable `createBeaconTransport` (sendBeacon-first, `fetch` fallback) + `createMemoryTransport`, a pure `shouldTrack()` consent/DNT gate, `parseUtm()` for campaign attribution, and a CSPRNG `randomId()`. All side-effects are injected, so tests never touch the network or a real browser.

- 🍪 Cookieless & fingerprint-free — the `sid` is per-page-load and never persisted
- 📡 `sendBeacon` first (falls back to `fetch`) — events survive page unload
- 🧭 `autoTrack()` — page views on SPA route changes, returns a cleanup function
- 🙈 Honours `navigator.doNotTrack`; no-ops safely on the server
- 🌍 Zero dependencies · isomorphic · fully typed

## Install

```bash
npm i @lacspace/analytics-lite
```

## Use it

```ts
import { createAnalytics } from "@lacspace/analytics-lite";

const analytics = createAnalytics({
  endpoint: "/api/collect",  // your own collector
  siteId: "acme",
});

analytics.pageview();                       // manual page view
analytics.track("signup", { plan: "pro" }); // custom event
const stop = analytics.autoTrack();         // auto page views on route change (SPA)
```

In a Next.js app, call `autoTrack()` once from a client component in your layout.

## What gets sent (and what doesn't)

Each event is a small JSON object:

```jsonc
{
  "type": "pageview",       // or your event name
  "siteId": "acme",
  "path": "/pricing",       // path + query, no hash
  "referrer": "google.com", // referrer HOST only — never the full URL
  "screen": "1440x900",
  "language": "en",
  "sid": "k3f9a1c2",        // ephemeral, per-page-load — NOT persisted
  "ts": 1724400000000
}
```

- ❌ No cookies. ❌ No persistent visitor id. ❌ No IP stored client-side. ❌ No full referrer URLs.
- ✅ The `sid` is regenerated on every page load, so it can't follow a visitor across sessions or sites.
- ✅ Honours `navigator.doNotTrack` (disable with `respectDNT: false`).
- ✅ No-ops safely on the server — import it anywhere.

## API

| | |
| --- | --- |
| `createAnalytics({ endpoint, siteId, respectDNT?, debug?, globalProps? })` | create a tracker |
| `.pageview(path?)` | send a page view |
| `.track(name, props?)` | send a custom event |
| `.autoTrack()` | patch history + popstate; returns a cleanup fn |
| `.enabled` | `true` when actually sending (browser, not DNT) |

Set `debug: true` to log events to the console instead of sending them.

## Batching client (new in 1.1.0)

When you want to coalesce events and control exactly where/how they go — with everything injectable so tests stay hermetic — use the lite client:

```ts
import {
  createLiteClient,
  createBeaconTransport,
  parseUtm,
} from "@lacspace/analytics-lite";

const analytics = createLiteClient({
  transport: createBeaconTransport("/api/collect"), // sendBeacon-first, fetch fallback
  siteId: "acme",
  campaign: parseUtm(location.search),              // { source, medium, name, ... }
  flushAt: 10,                                       // flush once 10 events queue
  flushInterval: 15_000,                             // ...or every 15s
  consent: true,                                     // gate on your own consent flag
});

analytics.page("/pricing");
analytics.track("signup", { plan: "pro" });
// also flushes automatically at size, on the interval, and on page unload
analytics.flush();
```

Blocked by consent or Do-Not-Track? Events are dropped at ingest — nothing is buffered or sent. In tests, inject a fake transport/timer/unload target (or `createMemoryTransport()`); nothing hits the network or the browser.

### API (1.1.0)

| | |
| --- | --- |
| `createLiteClient(opts?)` / `new LiteClient(opts?)` | batching client: `.track(name, props?)`, `.page(name?, props?)`, `.flush()`, `.close()`, `.setConsent(v)`, `.enabled`, `.queued`, `.anonymousId` |
| `createBeaconTransport(endpoint, { sendBeacon?, fetchImpl?, headers? })` | a `Transport` using `sendBeacon` when available, else `fetch` (both injectable) |
| `createMemoryTransport()` | a `Transport` that records `events` / `batches` in memory (tests & dev) |
| `shouldTrack({ consent?, dnt?, respectDNT?, defaultConsent? })` | pure consent + DNT predicate |
| `detectDNT()` | read the browser DNT signal (`true`/`false`/`undefined`) |
| `parseUtm(url)` | parse `utm_*` params into a `Campaign` (or `undefined`) |
| `randomId()` | CSPRNG hex id (Web Crypto) with a safe fallback |

Lite-client options include injectable `transport`, `now`, `setTimer`/`clearTimer`, `unloadTarget`, plus `flushAt`, `flushInterval`, `maxQueueSize`, `consent`, `respectDNT`, `dnt`, `defaultConsent`, `siteId`, `campaign`, `anonymousId`, `genId`.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/analytics-lite` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/analytics-lite
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

