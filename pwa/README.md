# @lacspace/pwa

**Turn any site into an installable, offline-capable, push-ready PWA — zero dependencies.**

It generates the two files a PWA needs (a **service worker** and a **web app
manifest**) and gives you tiny browser helpers to register the worker and drive
the install prompt. Framework-agnostic: Next.js, Vite, Astro, or plain HTML.

Pairs perfectly with [`@lacspace/web-push`](https://developer.lacspace.com/packages/web-push) —
the generated service worker already includes the `push` + `notificationclick` handlers.

```bash
npm i @lacspace/pwa
```

---

## Generate the files (build/server side)

```ts
import { generateServiceWorker, manifestToJSON, generateOfflinePage } from "@lacspace/pwa";
import { writeFileSync } from "node:fs";

// public/manifest.webmanifest
writeFileSync("public/manifest.webmanifest", manifestToJSON({
  name: "Lacspace",
  shortName: "Lacspace",
  themeColor: "#4d9fff",
  backgroundColor: "#0b0b0f",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}));

// public/sw.js
writeFileSync("public/sw.js", generateServiceWorker({
  cacheName: "lacspace-v1",           // bump to force an update
  precache: ["/", "/offline"],        // app shell cached on install
  offlineUrl: "/offline",             // shown when a navigation fails offline
  strategy: "stale-while-revalidate", // runtime GET strategy
}));

// public/offline.html (or wire /offline to this)
writeFileSync("public/offline.html", generateOfflinePage({ title: "You're offline" }));
```

Add the manifest + meta tags to your `<head>`:

```ts
import { manifestLinkTags } from "@lacspace/pwa";
// returns an HTML string of <link>/<meta> tags
manifestLinkTags({ themeColor: "#4d9fff", appleTouchIcon: "/icons/icon-192.png" });
```

## Register it (browser side)

```ts
import { registerServiceWorker, watchInstallAvailability, promptInstall, isInstalled } from "@lacspace/pwa/client";

// on app start
registerServiceWorker("/sw.js");

// "Install app" button
const stop = watchInstallAvailability((available) => setShowInstall(available));
async function onInstallClick() {
  const outcome = await promptInstall(); // "accepted" | "dismissed" | "unavailable"
}
```

---

## Caching strategies

| Strategy | Best for |
| --- | --- |
| `stale-while-revalidate` (default) | Most assets — instant from cache, refreshed in the background. |
| `network-first` | HTML/navigations and API-ish GETs — fresh when online, cached fallback offline. |
| `cache-first` | Long-lived, hashed static assets. |

Navigations always try the network first and fall back to your `offlineUrl`.

## API

**Server:** `generateManifest`, `manifestToJSON`, `manifestLinkTags`,
`generateServiceWorker`, `generateOfflinePage`.

**Client (`@lacspace/pwa/client`):** `registerServiceWorker`, `unregisterServiceWorkers`,
`watchInstallAvailability`, `canInstall`, `promptInstall`, `isInstalled`,
`isServiceWorkerSupported`.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
