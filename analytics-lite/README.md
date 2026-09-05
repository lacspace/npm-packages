<div align="center">

# @lacspace/analytics-lite

**Cookieless, privacy-first web analytics — to your own endpoint. No consent banner.**

[![npm version](https://img.shields.io/npm/v/@lacspace/analytics-lite?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/analytics-lite)
[![license](https://img.shields.io/npm/l/@lacspace/analytics-lite?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Page views and custom events, sent to a URL **you** control. No cookies, no `localStorage` identifiers, no cross-site tracking, no fingerprinting — so in most places you don't need a consent banner. Respects Do-Not-Track, auto-tracks SPA navigation, and uses `sendBeacon` so events survive page unload.

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

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/analytics-lite` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/analytics-lite
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

