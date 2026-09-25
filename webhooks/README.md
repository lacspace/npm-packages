<div align="center">

# @lacspace/webhooks

**The webhook toolkit for both directions — sign & deliver outgoing, verify incoming (Stripe / GitHub / Shopify presets), with idempotency.**

[![npm version](https://img.shields.io/npm/v/@lacspace/webhooks?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/webhooks)
[![install size](https://packagephobia.com/badge?p=@lacspace/webhooks)](https://packagephobia.com/result?p=@lacspace/webhooks)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/webhooks?label=minzip)](https://bundlephobia.com/package/@lacspace/webhooks)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/webhooks)
[![license](https://img.shields.io/npm/l/@lacspace/webhooks?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Webhooks are simple until you do them right: HMAC signatures, replay windows, timing-safe comparison, retries with backoff, and never processing the same event twice. This does all of it — both sending and receiving — with a single internal dependency ([`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) for Web Crypto HMAC) and nothing else. The hosted alternative (svix) is a paid SaaS; this is the library.

- ✍️ **Send** — `sign()` + `deliver()` with retries, exponential backoff & jitter
- ✅ **Receive** — `verify()` (timing-safe, replay-protected) + presets for **Stripe, GitHub, Shopify**
- ♻️ **Idempotency** — event ids + a dedupe store so handlers run exactly once
- 📨 **Route** — typed event envelopes + an endpoint registry that computes who receives what (pure)
- 🔐 Built on [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) (Web Crypto HMAC) · ⚡ isomorphic · one internal dependency

> **New in 1.1.0** — a typed [event envelope](#event-envelope--routing) (`createEvent`), an exactly-once consumer helper (`processOnce`), a pure [endpoint registry](#event-envelope--routing) (`routeEvent` / `EndpointRegistry`) that computes which endpoints receive an event, and a per-attempt delivery `log` + `onAttempt` callback on `deliver`. All additive — every existing export is unchanged.

## What's new in 1.2.0

- **Standard Webhooks support**: the scheme used by OpenAI, Svix, Resend, Clerk
  and Supabase. `verifyStandardWebhook(rawBody, request.headers, { secret })` checks
  their webhooks, and `deliver(url, event, { secret, scheme: "standard-webhooks" })`
  sends ones their libraries accept. Checked against the spec's published
  signature, and both ways against the official `standardwebhooks` package.
- **Heads-up if your receiver uses a Standard Webhooks library.** `deliver()` has
  always used the Standard Webhooks header *names* with this package's own
  `t=…,v1=<hex>` signature, which those libraries reject. Pass
  `scheme: "standard-webhooks"`. The default is unchanged so existing receivers
  that use this package's `verify()` keep working.
- **Protection against server-side request forgery (SSRF).** `deliver()` now always
  refuses cloud metadata addresses such as `169.254.169.254`, where AWS, GCP and
  Azure hand out credentials. When the URL comes from a customer, add
  `blockPrivateNetworks: true`. That refuses localhost, private, link-local and
  unique-local targets however they're written (`2130706433`, `0x7f.1`,
  `[::ffff:…]`), and stops following redirects. Add
  `resolveHost: (h) => dns.promises.resolve(h)` to also refuse public names that
  resolve inside. A refused URL returns `{ ok: false, attempts: 0, error }`, and
  nothing is sent.

## Install

```bash
npm install @lacspace/webhooks      # or pnpm add / yarn add / bun add
```

## Receiving webhooks

```ts
import { verify } from "@lacspace/webhooks";

// in your route — use the RAW request body, not the parsed JSON
const rawBody = await request.text();
const r = await verify(rawBody, request.headers.get("webhook-signature"), {
  secret: process.env.WEBHOOK_SECRET!,
  toleranceSec: 300, // reject anything older than 5 min (replay protection)
});

if (!r.valid) return new Response(`rejected: ${r.reason}`, { status: 400 });
// r.reason ∈ "no-signature" | "bad-format" | "bad-signature" | "timestamp-out-of-tolerance"
```

### Provider presets

```ts
import { verifyStripe, verifyGitHub, verifyShopify } from "@lacspace/webhooks";

await verifyStripe(raw, request.headers.get("stripe-signature"), { secret });
await verifyGitHub(raw, request.headers.get("x-hub-signature-256"), { secret });
await verifyShopify(raw, request.headers.get("x-shopify-hmac-sha256"), { secret });
```

## Sending webhooks (with retries)

```ts
import { deliver } from "@lacspace/webhooks";

const r = await deliver("https://client.app/webhooks", event, {
  secret: process.env.SIGNING_SECRET!, // attaches a signature the receiver can verify
  retries: 4,                          // + exponential backoff with full jitter
  timeoutMs: 10_000,
});
// { ok, status, attempts, idempotencyKey, id, error? }
```

Retries network errors and retryable statuses (408 / 425 / 429 / 5xx); gives up on 4xx. Each request carries `webhook-signature`, `webhook-timestamp`, `webhook-id` and `idempotency-key`.

Just need the headers? Use `signHeaders(body, { secret })`.

## Idempotency (exactly-once handlers)

```ts
import { isDuplicate, MemoryIdempotencyStore } from "@lacspace/webhooks";

const store = new MemoryIdempotencyStore(); // swap for a Redis-backed IdempotencyStore in prod

if (await isDuplicate(event.id, store)) return ok(); // already handled — no-op
await process(event);
```

## Event envelope & routing

```ts
import { createEvent, processOnce, routeEvent, EndpointRegistry } from "@lacspace/webhooks";

// Producer side — a typed envelope: { id, type, created, data }
const event = createEvent("invoice.paid", { invoiceId: "in_123", amount: 4200 });

// Which subscribed endpoints should receive it? (pure, synchronous)
const registry = new EndpointRegistry();
registry.subscribe("acme", "https://acme.example/hooks", ["invoice.*"], secretForAcme);
registry.subscribe("all", "https://ops.example/hooks", ["*"]);
const targets = registry.endpointsFor(event); // → [acme, all]
await Promise.all(targets.map((e) => deliver(e.url, event, { secret: e.secret })));

// Or route a plain list with the pure helper:
routeEvent(endpoints, "invoice.paid");

// Consumer side — run a handler at most once per event id (dedupe window = store TTL)
const { processed } = await processOnce(event, store, async (e) => save(e.data));
if (!processed) return ok(); // redelivery — already handled
```

Patterns: `"*"` (all events), `"invoice.*"` (prefix), or an exact `"invoice.paid"`. An endpoint with no `events` is subscribed to everything; `disabled: true` receives nothing.

## Per-attempt delivery log

```ts
const r = await deliver(url, event, {
  secret,
  onAttempt: (a) => metrics.record(a), // { attempt, ok, status?, error?, retryable, delayMs? }
});
r.log; // AttemptResult[] — one entry per try, in order
```

## API

| Export | Description |
| --- | --- |
| `sign(payload, { secret, timestamp? })` | `t=…,v1=…` signature |
| `verify(payload, header, { secret, toleranceSec? })` | `{ valid, reason?, timestamp? }` |
| `verifyStripe` / `verifyGitHub` / `verifyShopify` | provider presets |
| `deliver(url, payload, opts)` | POST with signing + retries + backoff; returns per-attempt `log` (+ `onAttempt`) |
| `signHeaders(body, { secret })` | ready-to-send request headers |
| `newId(prefix?)` | unique event id, e.g. `evt_…` |
| `isDuplicate(key, store)` · `MemoryIdempotencyStore` | dedupe |
| `createEvent(type, data, opts?)` · `isWebhookEvent(v)` | typed event envelope `{ id, type, created, data }` |
| `processOnce(event, store, handler)` | run a handler at most once per event id |
| `routeEvent(endpoints, type)` · `matchesEventType` · `endpointSubscribes` | pure endpoint routing |
| `EndpointRegistry` | in-memory subscribe / route / manage endpoints |

Signature scheme: HMAC over `"<timestamp>.<payload>"` as `t=<unix>,v1=<hex>` (the same construction Stripe uses). Default hash `SHA-256`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/webhooks` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/webhooks
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

