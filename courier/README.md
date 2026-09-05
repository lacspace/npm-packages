<div align="center">

# @lacspace/courier

**Courier / last-mile delivery toolkit — a canonical delivery state machine, a Pathao (Nepal) adapter, and inbound webhook verification + status normalization. Over global `fetch` and Web Crypto.**

[![npm version](https://img.shields.io/npm/v/@lacspace/courier?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/courier)
[![install size](https://packagephobia.com/badge?p=@lacspace/courier)](https://packagephobia.com/result?p=@lacspace/courier)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/courier?label=minzip)](https://bundlephobia.com/package/@lacspace/courier)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/courier)
[![license](https://img.shields.io/npm/l/@lacspace/courier?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Stop clicking Confirmed → Pickup → Transit → Delivered by hand. This is the courier layer for a multi-vendor shop: one **canonical delivery state machine**, a **Pathao "Aladdin" Merchant API v1** adapter (token auto-refresh, order creation, price/city/zone/area lookups), and **inbound webhooks** — verify the shared-secret / HMAC signature and normalize any carrier event into your own status vocabulary. Zero dependencies, isomorphic, fully typed.

- 🚦 **State machine** — one `DeliveryStatus` vocabulary + guarded `transition()` that refuses illegal jumps and marks terminal states
- 🇳🇵 **Pathao adapter** — `issueToken` (cached + auto-refresh), `createOrder`, `priceCalculation`, `cities`/`zones`/`areas`
- 📡 **Inbound webhooks** — `verifyWebhookSignature` (HMAC-SHA256, timing-safe) + `parsePathaoWebhook` / `normalizePathaoStatus`
- 🔌 **Adapter-shaped** — code against `CourierAdapter`; swap or add carriers without touching your order flow
- ⚡ Isomorphic — Node 18+, edge runtimes & browsers · global `fetch` + Web Crypto only · 📦 ESM + CJS · zero deps

## Install

```bash
npm install @lacspace/courier      # or pnpm add / yarn add / bun add
```

## The delivery state machine

```ts
import { transition, canTransition, isTerminal } from "@lacspace/courier";

const order = { id: "A1", status: "confirmed" as const };

const next = transition(order, "picked_up"); // → new object, status "picked_up"
canTransition("pending", "delivered");        // false — can't skip the chain
isTerminal("delivered");                       // true

transition({ status: "delivered" as const }, "returned");
// throws CourierError { code: "illegal_transition" }
```

`transition()` never mutates — it returns a shallow copy with the new `status`. The allowed moves live in `DELIVERY_TRANSITIONS`.

## Pathao adapter

```ts
import { createPathaoAdapter, PATHAO_SANDBOX_BASE_URL } from "@lacspace/courier";

const pathao = createPathaoAdapter({
  clientId: process.env.PATHAO_CLIENT_ID!,
  clientSecret: process.env.PATHAO_CLIENT_SECRET!,
  username: process.env.PATHAO_USERNAME!,
  password: process.env.PATHAO_PASSWORD!,
  storeId: Number(process.env.PATHAO_STORE_ID),
  // baseUrl defaults to production api-hermes.pathao.com;
  // use PATHAO_SANDBOX_BASE_URL for the courier-api-sandbox host.
});

const shipment = await pathao.createOrder({
  recipientName: "Ram Thapa",
  recipientPhone: "9800000000",
  recipientAddress: "Baneshwor, Kathmandu",
  cityId: 1, zoneId: 2, areaId: 3,
  amountToCollect: 1500,           // COD; 0 for prepaid
  itemQuantity: 1,
  itemWeight: 0.5,                 // kg
  description: "T-shirt",
  merchantOrderId: "SHOP-42",
});
// shipment.trackingId === Pathao consignment_id, status "confirmed"
```

The token is issued lazily, cached, and auto-refreshed a minute before it expires. `priceCalculation()`, `cities()`, `zones(cityId)` and `areas(zoneId)` are also exposed.

> **Note:** Pathao has no clean public track-by-consignment endpoint in v1. `track()` throws `CourierError { code: "unsupported" }` on purpose — Pathao reports status via **webhooks** (below).

## Inbound webhooks

```ts
import {
  verifyPathaoWebhook,
  verifyWebhookSignature,
  parsePathaoWebhook,
  PATHAO_WEBHOOK_ACK_HEADER,
  transition,
} from "@lacspace/courier";

// In your webhook route (raw body string in hand):
if (!verifyPathaoWebhook({ headerSecret: req.header("X-PATHAO-Signature"), expectedSecret: SECRET })) {
  return res.status(401).end();
}

const evt = parsePathaoWebhook(rawBody); // { event, status, consignmentId, merchantOrderId, raw }
const order = await db.orders.findByConsignment(evt.consignmentId);
await db.orders.save(transition(order, evt.status)); // guarded advance

// Pathao expects a 202 that echoes the integration secret back:
res.setHeader(PATHAO_WEBHOOK_ACK_HEADER, SECRET).status(202).end();
```

For carriers that sign the body (rather than a shared header), use the generic HMAC verifier:

```ts
const ok = await verifyWebhookSignature(rawBody, signatureHeader, secret); // HMAC-SHA256 hex, timing-safe
```

## API

| Export | Description |
| --- | --- |
| `DeliveryStatus` | `pending \| confirmed \| picked_up \| in_transit \| out_for_delivery \| delivered \| returned \| cancelled \| failed \| on_hold` |
| `DELIVERY_TRANSITIONS` | `Record<DeliveryStatus, DeliveryStatus[]>` — allowed forward moves |
| `canTransition(from, to)` / `isTerminal(s)` | state-machine guards |
| `transition(order, to)` | new object with updated `status`; throws on illegal move |
| `CourierError` | `Error` with optional `code` / `status` |
| `CourierAdapter` / `CourierShipment` / `CreateOrderInput` | carrier-agnostic contract |
| `createPathaoAdapter(config)` | Pathao adapter + `issueToken` / `priceCalculation` / `cities` / `zones` / `areas` |
| `PATHAO_PROD_BASE_URL` / `PATHAO_SANDBOX_BASE_URL` | Pathao hosts |
| `verifyWebhookSignature(payload, signature, secret)` | HMAC-SHA256 hex, timing-safe |
| `verifyPathaoWebhook({ headerSecret, expectedSecret })` | timing-safe shared-secret compare |
| `parsePathaoWebhook(body)` / `normalizePathaoStatus(event)` | event → canonical status |
| `PATHAO_STATUS_MAP` / `PATHAO_WEBHOOK_ACK_HEADER` | Pathao event map + ack header name |

All crypto uses Web Crypto (`globalThis.crypto.subtle`) — never hand-rolled. `timingSafeEqual` is exported too.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/courier` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
