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
- 🔐 Built on [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) (Web Crypto HMAC) · ⚡ isomorphic · one internal dependency

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

## API

| Export | Description |
| --- | --- |
| `sign(payload, { secret, timestamp? })` | `t=…,v1=…` signature |
| `verify(payload, header, { secret, toleranceSec? })` | `{ valid, reason?, timestamp? }` |
| `verifyStripe` / `verifyGitHub` / `verifyShopify` | provider presets |
| `deliver(url, payload, opts)` | POST with signing + retries + backoff |
| `signHeaders(body, { secret })` | ready-to-send request headers |
| `newId(prefix?)` | unique event id, e.g. `evt_…` |
| `isDuplicate(key, store)` · `MemoryIdempotencyStore` | dedupe |

Signature scheme: HMAC over `"<timestamp>.<payload>"` as `t=<unix>,v1=<hex>` (the same construction Stripe uses). Default hash `SHA-256`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
