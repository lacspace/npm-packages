# @lacspace/consent

**GDPR-friendly cookie consent — zero dependencies, no vendor.**

Track which categories a visitor agreed to (analytics / marketing / preferences),
persist the decision to a **cookie** (so your server can gate too), and defer
scripts until permission exists. Ships a framework-agnostic store, a drop-in
**vanilla banner**, and a **React** `<ConsentBanner/>` + `useConsent()`.

```bash
npm i @lacspace/consent
```

Pairs with [`@lacspace/captcha`](https://developer.lacspace.com/packages/captcha)
for a privacy stack that needs no third parties.

---

## Vanilla / any framework

```ts
import { consent, mountConsentBanner, whenConsent } from "@lacspace/consent";

mountConsentBanner({ policyUrl: "/privacy" }); // shows only until the visitor decides

// Load analytics ONLY after consent (now, or the moment they grant it):
whenConsent(consent, "analytics", () => {
  // e.g. inject your analytics tag here
});
```

## React

```tsx
import { ConsentBanner, useConsent } from "@lacspace/consent/react";

function App() {
  return (
    <>
      <YourApp />
      <ConsentBanner policyUrl="/privacy" />
    </>
  );
}

function Analytics() {
  const { has } = useConsent();
  return has("analytics") ? <PlausibleTag /> : null;
}
```

## Server-side gating

The decision is mirrored to a cookie, so you can gate on the server too:

```ts
import { parseConsentCookie } from "@lacspace/consent";

const consent = parseConsentCookie(req.headers.cookie ?? "");
if (consent?.analytics) {
  // render the analytics <script> in the initial HTML
}
```

---

## API

**Store:** `createConsent(options?)` → manager with `get`, `set(choice)`, `acceptAll`,
`rejectAll`, `has(category)`, `decided`, `reset`, `subscribe`. Default singleton exported as `consent`.

**Categories:** `necessary` (always on), `analytics`, `marketing`, `preferences`.

**Helpers:** `whenConsent(manager, category, fn)` (run/defer a script by consent),
`parseConsentCookie(cookieHeader)` (server-side read).

**Vanilla:** `mountConsentBanner(options)` → `unmount()`.
**React (`/react`):** `<ConsentBanner/>`, `useConsent()`.

`ConsentOptions`: `{ storageKey?, cookie?, cookieMaxAgeDays? }`.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
