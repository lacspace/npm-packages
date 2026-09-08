/**
 * @lacspace/pwa — make any site installable, offline-capable and push-ready.
 *
 * This module runs at BUILD/SERVER time and returns strings you write to disk:
 *   - `generateManifest()`      → your `manifest.webmanifest`
 *   - `generateServiceWorker()` → your `sw.js` (offline caching + push handlers)
 *
 * The generated service worker reads a small injected CONFIG object, so the
 * output is deterministic and easy to review. Zero dependencies.
 */

// ---------------------------------------------------------------------------
// Web App Manifest
// ---------------------------------------------------------------------------

export interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  /** "any" | "maskable" | "monochrome" (space-separated allowed). */
  purpose?: string;
}

export interface ManifestOptions {
  name: string;
  shortName?: string;
  description?: string;
  /** Browser UI / theme color, e.g. "#4d9fff". */
  themeColor?: string;
  /** Splash background color. */
  backgroundColor?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  startUrl?: string;
  scope?: string;
  orientation?: "any" | "natural" | "portrait" | "landscape";
  icons?: ManifestIcon[];
  categories?: string[];
  lang?: string;
  id?: string;
}

export interface WebAppManifest {
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  orientation?: string;
  icons: ManifestIcon[];
  categories?: string[];
  lang?: string;
  id?: string;
}

const DEFAULT_ICONS: ManifestIcon[] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/** Build a web app manifest object from friendly options (sensible defaults). */
export function generateManifest(options: ManifestOptions): WebAppManifest {
  const manifest: WebAppManifest = {
    name: options.name,
    short_name: options.shortName ?? options.name,
    start_url: options.startUrl ?? "/",
    scope: options.scope ?? "/",
    display: options.display ?? "standalone",
    theme_color: options.themeColor ?? "#000000",
    background_color: options.backgroundColor ?? "#ffffff",
    icons: options.icons ?? DEFAULT_ICONS,
  };
  if (options.description) manifest.description = options.description;
  if (options.orientation) manifest.orientation = options.orientation;
  if (options.categories) manifest.categories = options.categories;
  if (options.lang) manifest.lang = options.lang;
  if (options.id) manifest.id = options.id;
  return manifest;
}

/** The manifest as a pretty JSON string, ready to write to `manifest.webmanifest`. */
export function manifestToJSON(options: ManifestOptions): string {
  return `${JSON.stringify(generateManifest(options), null, 2)}\n`;
}

/**
 * `<link>`/`<meta>` tags to drop in your `<head>` to wire the manifest, theme
 * color and iOS bits. Returns a plain HTML string.
 */
export function manifestLinkTags(options: {
  manifestUrl?: string;
  themeColor?: string;
  appleTouchIcon?: string;
  appleTitle?: string;
}): string {
  const lines = [
    `<link rel="manifest" href="${options.manifestUrl ?? "/manifest.webmanifest"}" />`,
    `<meta name="theme-color" content="${options.themeColor ?? "#000000"}" />`,
    `<meta name="mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`,
  ];
  if (options.appleTitle) lines.push(`<meta name="apple-mobile-web-app-title" content="${options.appleTitle}" />`);
  if (options.appleTouchIcon) lines.push(`<link rel="apple-touch-icon" href="${options.appleTouchIcon}" />`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

export type CacheStrategy = "network-first" | "cache-first" | "stale-while-revalidate";

export interface ServiceWorkerOptions {
  /** Cache bucket name. CHANGE THIS (e.g. bump a version) to force a refresh. */
  cacheName?: string;
  /** URLs cached on install so the app shell works offline immediately. */
  precache?: string[];
  /** Page served for navigations when the network fails (your offline page). */
  offlineUrl?: string;
  /** Runtime GET strategy for same-origin requests. Default stale-while-revalidate. */
  strategy?: CacheStrategy;
  /** Include Web Push `push` + `notificationclick` handlers. Default true. */
  enablePush?: boolean;
  /** Activate the new worker immediately instead of waiting. Default true. */
  skipWaiting?: boolean;
  /** Enable navigation preload for faster first navigations. Default true. */
  navigationPreload?: boolean;
}

interface SwConfig {
  cacheName: string;
  precache: string[];
  offlineUrl: string | null;
  strategy: CacheStrategy;
  enablePush: boolean;
  skipWaiting: boolean;
  navigationPreload: boolean;
}

// The runtime lives in this static string so the output is stable and reviewable.
// It reads the injected CONFIG object — no interpolation inside the logic.
const SW_RUNTIME = `
const CACHE = CONFIG.cacheName;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      if (CONFIG.precache.length) await cache.addAll(CONFIG.precache);
      if (CONFIG.skipWaiting) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (CONFIG.navigationPreload && self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function networkFirst(request, preload) {
  try {
    const response = (await preload) || (await fetch(request));
    if (response && response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request, preload) {
  const cached = await caches.match(request);
  const network = (async () => {
    const response = (await preload) || (await fetch(request));
    if (response && response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })();
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request, event.preloadResponse);
        } catch (err) {
          if (CONFIG.offlineUrl) {
            const offline = await caches.match(CONFIG.offlineUrl);
            if (offline) return offline;
          }
          throw err;
        }
      })(),
    );
    return;
  }

  if (CONFIG.strategy === "cache-first") {
    event.respondWith(cacheFirst(request));
  } else if (CONFIG.strategy === "network-first") {
    event.respondWith(networkFirst(request, event.preloadResponse));
  } else {
    event.respondWith(staleWhileRevalidate(request, event.preloadResponse));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
`;

const SW_PUSH = `
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Notification";
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    image: data.image,
    tag: data.tag,
    data: { url: data.url || "/", ...(data.data || {}) },
    actions: data.actions,
    requireInteraction: data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })(),
  );
});
`;

/**
 * Generate a production-ready service worker as a JS string. Write it to a file
 * your site serves at the SW scope (e.g. `public/sw.js`).
 *
 * @example
 * import { generateServiceWorker } from "@lacspace/pwa";
 * import { writeFileSync } from "node:fs";
 * writeFileSync("public/sw.js", generateServiceWorker({
 *   cacheName: "myapp-v1",
 *   precache: ["/", "/offline", "/styles.css"],
 *   offlineUrl: "/offline",
 * }));
 */
export function generateServiceWorker(options: ServiceWorkerOptions = {}): string {
  const config: SwConfig = {
    cacheName: options.cacheName ?? "app-v1",
    precache: options.precache ?? [],
    offlineUrl: options.offlineUrl ?? null,
    strategy: options.strategy ?? "stale-while-revalidate",
    enablePush: options.enablePush ?? true,
    skipWaiting: options.skipWaiting ?? true,
    navigationPreload: options.navigationPreload ?? true,
  };
  const header = "// Service worker generated by @lacspace/pwa — safe to commit.\n";
  const configLine = `const CONFIG = ${JSON.stringify(config, null, 2)};\n`;
  return header + configLine + SW_RUNTIME + (config.enablePush ? SW_PUSH : "") + "\n";
}

/** A minimal, dependency-free offline fallback HTML page. */
export function generateOfflinePage(options: { title?: string; message?: string } = {}): string {
  const title = options.title ?? "You're offline";
  const message = options.message ?? "This page isn't available without a connection. Please try again.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
        font: 16px/1.5 system-ui, sans-serif; background: #0b0b0f; color: #f4f4f5; text-align: center; padding: 24px; }
      h1 { font-size: 1.4rem; margin: 0 0 8px; }
      p { margin: 0; opacity: 0.7; max-width: 32ch; }
    </style>
  </head>
  <body>
    <div>
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>
`;
}
