<div align="center">

# @lacspace/khalti

**Khalti KPG-2 (ePayment API v2, Nepal) — initiate payments, look up status, typed errors and `Key` auth over `fetch`.**

[![npm version](https://img.shields.io/npm/v/@lacspace/khalti?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/khalti)
[![install size](https://packagephobia.com/badge?p=@lacspace/khalti)](https://packagephobia.com/result?p=@lacspace/khalti)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/khalti?label=minzip)](https://bundlephobia.com/package/@lacspace/khalti)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/khalti)
[![license](https://img.shields.io/npm/l/@lacspace/khalti?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A tiny, fully-typed client for **Khalti**'s KPG-2 (ePayment API v2) — Nepal's leading digital wallet. Two calls: `initiate()` to start a payment and get a redirect URL, and `lookup()` to verify the real status by `pidx`. Amounts in **paisa**, `Authorization: Key` auth, and Khalti's error bodies surfaced as a typed `KhaltiError`. Zero dependencies, isomorphic, injectable `fetch`.

> **New in 1.1.0** — pure, zero-network helpers around the same live flow (nothing about `initiate()`/`lookup()` changed): request **builders** (`buildInitiateBody`, `buildLookupBody`), **amount validation** in paisa (`validateAmount`), **callback verification** (`parseCallbackParams`, `verifyCallback`), **config presets** (`KHALTI_SANDBOX_BASE_URL` / `KHALTI_PRODUCTION_BASE_URL`, `buildAuthHeader`), and a CSPRNG **`purchase_order_id` generator** (`generateOrderId`).

- 🚀 **`initiate()`** — create a payment, get back `pidx` + `payment_url` to redirect to
- 🔎 **`lookup()`** — the source of truth: verify status by `pidx` after the customer returns
- 🧨 **Typed errors** — non-2xx responses throw `KhaltiError` with `status` + parsed `detail`
- 🔑 Server-side `Authorization: Key <secretKey>` · amounts in paisa (integer)
- ⚡ Isomorphic — Node 20+, edge runtimes & browsers via global `fetch` (injectable) · 📦 ESM + CJS · zero deps

## Install

```bash
npm install @lacspace/khalti      # or pnpm add / yarn add / bun add
```

## Initiate a payment

```ts
import { initiate } from "@lacspace/khalti";

const { payment_url, pidx } = await initiate(
  {
    return_url: "https://myshop.np/khalti/return",
    website_url: "https://myshop.np",
    amount: 1000, // NPR 10, in paisa
    purchase_order_id: "order-42",
    purchase_order_name: "Test order",
    customer_info: { name: "Ram", email: "ram@example.com", phone: "9800000000" },
  },
  { secretKey: process.env.KHALTI_SECRET!, env: "test" },
);

// redirect the customer to payment_url; keep pidx to verify later.
```

## Verify with lookup (never trust the callback alone)

```ts
import { lookup } from "@lacspace/khalti";

const r = await lookup(pidx, { secretKey: process.env.KHALTI_SECRET!, env: "test" });
if (r.status === "Completed") {
  fulfilOrder(r.transaction_id);
}
// status: "Completed" | "Pending" | "Initiated" | "Refunded" | "Expired" | "User canceled" | "Partially Refunded"
```

## Handle errors

```ts
import { initiate, KhaltiError } from "@lacspace/khalti";

try {
  await initiate(payload, { secretKey });
} catch (e) {
  if (e instanceof KhaltiError) {
    console.error(e.status, e.detail); // e.g. 400, "Amount should be greater than Rs. 1."
  }
}
```

## Helpers (New in 1.1.0) — pure, no network

```ts
import {
  buildInitiateBody, buildLookupBody,
  validateAmount, KHALTI_MIN_AMOUNT_PAISA,
  parseCallbackParams, verifyCallback,
  buildAuthHeader, KHALTI_SANDBOX_BASE_URL, KHALTI_PRODUCTION_BASE_URL,
  generateOrderId,
} from "@lacspace/khalti";

// 1. Validate the amount (in paisa) before you send it.
const check = validateAmount(1000, {
  breakdown: [{ label: "Item", amount: 600 }, { label: "Tax", amount: 400 }],
});
if (!check.valid) throw new Error(check.errors.join("; "));

// 2. Build a stable, unique order id + the initiate body (then POST it yourself, or pass to initiate()).
const purchase_order_id = generateOrderId();            // "order-lk3n2p-9f1c0a7b3d5e2f18"
const body = buildInitiateBody({
  return_url: "https://myshop.np/khalti/return",
  website_url: "https://myshop.np",
  amount: 1000,
  purchase_order_id,
  purchase_order_name: "Test order",
});

// 3. When Khalti redirects back, shape + verify the callback (still confirm with lookup!).
const params = parseCallbackParams(new URL(req.url).searchParams);
const v = verifyCallback(params, { amount: 1000, purchase_order_id });
if (v.matches && v.shouldLookup) {
  const r = await lookup(v.pidx!, { secretKey });
  if (r.status === "Completed") fulfilOrder(r.transaction_id);
}
```

## API

| Export | Description |
| --- | --- |
| `initiate(payload, { secretKey, env?, fetch? })` | POST `/epayment/initiate/` → `{ pidx, payment_url, expires_at, expires_in }` |
| `lookup(pidx, { secretKey, env?, fetch? })` | POST `/epayment/lookup/` → `{ pidx, total_amount, status, transaction_id, fee, refunded }` |
| `KhaltiError` | thrown on non-2xx — `status` + parsed `detail` |
| `KhaltiStatus` | union of Khalti payment statuses |
| `KHALTI_BASE_URLS` | `{ test, prod }` base-URL map |
| `buildInitiateBody(input)` · `buildLookupBody(pidx)` | pure builders for the initiate / lookup request bodies (paisa) |
| `validateAmount(amount, { min?, max?, breakdown? })` | check paisa is an integer ≥ minimum, and that a breakdown sums to it → `{ valid, errors }` |
| `KHALTI_MIN_AMOUNT_PAISA` | Khalti's documented minimum (`1000` = Rs. 10) |
| `parseCallbackParams(query)` | normalise the redirect query (`URLSearchParams` or `req.query`) → typed `KhaltiCallbackParams` |
| `verifyCallback(params, { amount?, purchase_order_id?, successStatuses? })` | flag amount/status/order mismatches → `{ matches, completed, mismatches, pidx, shouldLookup }` (never calls lookup) |
| `KHALTI_SANDBOX_BASE_URL` · `KHALTI_PRODUCTION_BASE_URL` | named base-URL constants (same values as `KHALTI_BASE_URLS`) |
| `buildAuthHeader(secretKey)` | `{ Authorization: "Key <secretKey>" }` |
| `generateOrderId({ prefix?, timestamp?, bytes? })` | CSPRNG-backed unique `purchase_order_id` |

`env` is `"test"` (default, `a.khalti.com`) or `"prod"` (`khalti.com`). All amounts are in **paisa** (NPR 10 → `1000`). The 1.1.0 helpers are all pure and never touch the network — `verifyCallback` shapes the callback for a `lookup()` but never calls it (the callback is not authoritative on its own).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/khalti` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
