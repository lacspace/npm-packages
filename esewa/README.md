<div align="center">

# @lacspace/esewa

**eSewa ePay v2 (Nepal) — HMAC-SHA256 signing, checkout-form building, response verification & status checks, over Web Crypto.**

[![npm version](https://img.shields.io/npm/v/@lacspace/esewa?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/esewa)
[![install size](https://packagephobia.com/badge?p=@lacspace/esewa)](https://packagephobia.com/result?p=@lacspace/esewa)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/esewa?label=minzip)](https://bundlephobia.com/package/@lacspace/esewa)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/esewa)
[![license](https://img.shields.io/npm/l/@lacspace/esewa?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Integrate **eSewa** — Nepal's most-used payment gateway — the correct way. The signature eSewa demands (`HMAC-SHA256` over `total_amount,transaction_uuid,product_code`, base64) is trivial to get subtly wrong. This gets it right, builds the whole checkout form for you, verifies the signed response, and checks transaction status. Zero dependencies, isomorphic, fully typed.

- ✍️ **Correct signatures** — the exact `signed_field_names` message order, HMAC-SHA256, standard base64
- 🧾 **Form builder** — a ready-to-POST `{ action, method, fields }` with every field + a valid signature
- 🔎 **Verify responses** — decode & timing-safe-verify the base64 `data` payload eSewa returns on success
- 📡 **Status API** — query the transaction-status endpoint with an injectable `fetch`
- ⚡ Isomorphic — Node 20+, edge runtimes & browsers · Web Crypto only · 📦 ESM + CJS · zero deps

## Install

```bash
npm install @lacspace/esewa      # or pnpm add / yarn add / bun add
```

## Build & post the checkout form

```ts
import { buildForm, ESEWA_TEST_SECRET, ESEWA_TEST_PRODUCT_CODE } from "@lacspace/esewa";

const form = await buildForm(
  {
    amount: 100,
    taxAmount: 0,
    transactionUuid: crypto.randomUUID(),
    productCode: ESEWA_TEST_PRODUCT_CODE,
    successUrl: "https://myshop.np/esewa/success",
    failureUrl: "https://myshop.np/esewa/failure",
  },
  { secret: ESEWA_TEST_SECRET, env: "test" },
);

// form.action → the eSewa endpoint, form.method → "POST"
// render form.fields as hidden <input>s and auto-submit.
```

`total_amount` defaults to `amount + taxAmount + productServiceCharge + productDeliveryCharge`.

## Verify the success redirect

```ts
import { verifyResponse } from "@lacspace/esewa";

// eSewa redirects to your success_url with ?data=<base64 JSON>
const { valid, data } = await verifyResponse(url.searchParams.get("data")!, secret);
if (valid && data.status === "COMPLETE") {
  fulfilOrder(data.transaction_uuid);
}
```

`verifyResponse()` recomputes the signature over the fields named in the payload's own `signed_field_names` and compares it **timing-safe** — it never throws.

## Check transaction status

```ts
import { checkStatus } from "@lacspace/esewa";

const status = await checkStatus(
  { product_code: "EPAYTEST", total_amount: 100, transaction_uuid: "11-201" },
  { env: "test" },
);
// → { status: "COMPLETE", ... }
```

## API

| Export | Description |
| --- | --- |
| `signPayment({ total_amount, transaction_uuid, product_code }, secret)` | base64 HMAC-SHA256 signature |
| `buildForm(input, { secret, env? })` | `{ action, method, fields }` ready to POST |
| `verifyResponse(base64Data, secret)` | `{ valid, data }` — decode + timing-safe verify |
| `checkStatus(params, { env?, fetch? })` | GET the status API, returns parsed JSON |
| `ESEWA_FORM_URLS` / `ESEWA_STATUS_URLS` | `{ test, prod }` endpoint maps |
| `ESEWA_TEST_SECRET` / `ESEWA_TEST_PRODUCT_CODE` | sandbox credentials |
| `ESEWA_SIGNED_FIELD_NAMES` | `"total_amount,transaction_uuid,product_code"` |

`env` is `"test"` (default) or `"prod"`. Signatures use standard base64 (not url-safe), exactly as eSewa expects.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/esewa` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
