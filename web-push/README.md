# @lacspace/web-push

**Send real browser push notifications with zero dependencies and no vendor.**

No Firebase. No FCM account. No third-party service. Just the Web Push standard
(VAPID + RFC 8291 `aes128gcm`) implemented on the built-in Web Crypto API — so it
runs anywhere: **Node 20+, Deno, Bun, Cloudflare Workers, Vercel Edge**.

The encryption is verified byte-for-byte against the official **RFC 8291 test
vector** (and cross-checked with the RFC author's reference implementation).

```bash
npm i @lacspace/web-push
```

---

## 1. Generate your VAPID keys (once)

VAPID keys are your app's push identity. Generate them one time and store them
(the private key stays on the server; the public key is safe to ship to the browser).

```ts
import { generateVapidKeys } from "@lacspace/web-push";

const keys = await generateVapidKeys();
// { publicKey: "B...", privateKey: "..." }  → save both, e.g. in your .env
```

## 2. Subscribe the browser

On the client, register a service worker and subscribe. The helper does the whole
dance (register → ask permission → subscribe → POST the subscription to your API):

```ts
import { subscribeToPush } from "@lacspace/web-push/client";

await subscribeToPush({
  vapidPublicKey: PUBLIC_KEY,      // your VAPID public key
  serviceWorkerUrl: "/sw.js",      // default
  saveUrl: "/api/push/subscribe",  // your backend stores the subscription
});
```

Your service worker (`public/sw.js`) receives the pushes. Minimum version:

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Notification", {
      body: data.body,
      icon: data.icon,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
});
```

> Prefer to generate the service worker + manifest for you? Use
> [`@lacspace/pwa`](https://developer.lacspace.com/packages/pwa) — it pairs with this package.

## 3. Push from the server

```ts
import { sendNotification } from "@lacspace/web-push";

const vapid = {
  subject: "mailto:you@yoursite.com", // how a push service reaches you
  publicKey: process.env.VAPID_PUBLIC!,
  privateKey: process.env.VAPID_PRIVATE!,
};

const res = await sendNotification(
  subscription,                                  // the JSON your client saved
  JSON.stringify({ title: "New message", body: "Tap to read", url: "/inbox" }),
  { vapid },
);

if (res.expired) {
  await db.deleteSubscription(subscription.endpoint); // 404/410 → it's dead
}
```

Blasting to many subscribers? `sendNotifications` settles every one independently,
so one dead endpoint can't sink the batch:

```ts
import { sendNotifications } from "@lacspace/web-push";

const results = await sendNotifications(allSubscriptions, payload, { vapid });
const dead = results.filter((r) => r.result?.expired || r.error);
```

---

## API

| Export | What it does |
| --- | --- |
| `generateVapidKeys()` | Create a VAPID key pair (once). |
| `sendNotification(sub, payload, opts)` | Encrypt + sign + POST one push. `payload` may be `null` for a data-less "tickle". |
| `sendNotifications(subs, payload, opts)` | Same, fanned out; never rejects. |
| `createVapidHeaders(audience, vapid, exp?)` | Just the signed `Authorization` header. |
| `encryptPayload(payload, keys, opts?)` | Low-level aes128gcm encryption (accepts a fixed salt/keys for testing). |
| `isSubscriptionExpired(status)` | `true` for 404/410. |
| `toBase64url` / `fromBase64url` | Byte ⇄ base64url helpers. |

`SendOptions`: `{ vapid, ttl?, urgency?, topic?, expiration?, recordSize? }`.

### Edge runtimes

Because it's pure Web Crypto + `fetch`, it works unchanged in a Cloudflare Worker or
a Vercel Edge route — no Node built-ins required.

---

## Why not the classic `web-push` package?

That one pulls in a dependency tree and is Node-only. This is **zero-dependency**,
**isomorphic** (edge/Deno/Bun/browser-adjacent), and spec-verified. Same standard,
smaller and more portable.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
