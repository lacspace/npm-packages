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

> **New in 1.2.0** — additive, fully backward compatible (the signing/verify logic is byte-for-byte unchanged): `validateAmounts()` (offline check that `amount+tax+service+delivery === total_amount`), `generateTransactionUuid()` / `isValidTransactionUuid()` (CSPRNG-minted, sign-safe ids), `buildStatusRequest()` + `parseStatusResponse()` / `isEsewaStatus()` (a pure, no-I/O status request builder and typed response parser), and `decodeResponse()` / `verifyDecodedResponse()` (typed decode of the success payload — `verifyDecodedResponse` composes the existing `verifyResponse`).

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

> **eSewa amounts are in RUPEES, not paisa.** The rest of the @lacspace commerce suite (cart, order, tax, invoice, money…) stores integer **paisa**. Convert at this boundary with `paisaToRupees` — passing paisa straight through overcharges the customer 100×.
>
> ```ts
> import { buildForm, paisaToRupees } from "@lacspace/esewa";
>
> paisaToRupees(12345); // → 123.45
>
> // a Rs 123.45 order stored as 12345 paisa:
> await buildForm({ amount: paisaToRupees(12345), transactionUuid, productCode, successUrl, failureUrl }, { secret, env: "test" });
> ```

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

Prefer to run the request through your own `fetch`/cache/retry? Build it purely and parse the result into a typed shape — no network happens inside the library:

```ts
import { buildStatusRequest, parseStatusResponse } from "@lacspace/esewa";

const { url, method } = buildStatusRequest(
  { product_code: "EPAYTEST", total_amount: 100, transaction_uuid: "11-201" },
  { env: "test" },
);
const parsed = parseStatusResponse(await (await fetch(url, { method })).json());
if (parsed.status === "COMPLETE") fulfilOrder(parsed.transaction_uuid!); // status: EsewaStatus
```

## New helpers (1.2.0)

```ts
import {
  generateTransactionUuid,
  validateAmounts,
  decodeResponse,
  verifyDecodedResponse,
} from "@lacspace/esewa";

// 1. Mint a unique, sign-safe transaction_uuid with the platform CSPRNG.
const transactionUuid = generateTransactionUuid({ prefix: "order240" });

// 2. Guard your amounts BEFORE building the form (pure, offline).
const check = validateAmounts({ amount: 100, taxAmount: 13, totalAmount: 113 });
if (!check.ok) throw new Error(check.reason);

// 3. Decode the success payload into a typed object, then verify (composed).
const { valid, data } = await verifyDecodedResponse(rawData, secret);
if (valid && data.status === "COMPLETE") fulfilOrder(data.transaction_uuid!);

// decodeResponse() decodes WITHOUT verifying — use only to peek untrusted fields.
const untrusted = decodeResponse(rawData); // EsewaSuccessData | null
```

## API

| Export | Description |
| --- | --- |
| `signPayment({ total_amount, transaction_uuid, product_code }, secret)` | base64 HMAC-SHA256 signature |
| `paisaToRupees(paisa)` | convert integer paisa → rupees for eSewa's amount fields (`12345` → `123.45`) |
| `buildForm(input, { secret, env? })` | `{ action, method, fields }` ready to POST |
| `verifyResponse(base64Data, secret)` | `{ valid, data }` — decode + timing-safe verify |
| `checkStatus(params, { env?, fetch? })` | GET the status API, returns parsed JSON |
| `buildStatusRequest(params, { env? })` | pure `{ url, method, params }` for the status API — no I/O |
| `parseStatusResponse(json)` | narrow untyped status JSON → typed `StatusResponse` (`.status`, `.ref_id`, `.raw`…) |
| `isEsewaStatus(x)` | type-guard for the documented `EsewaStatus` values |
| `validateAmounts({ amount, taxAmount?, ..., totalAmount? })` | `{ ok, reason? }` — amounts non-negative + sum to `total_amount` |
| `generateTransactionUuid({ length?, prefix? })` | CSPRNG-minted, sign-safe `transaction_uuid` |
| `isValidTransactionUuid(uuid)` | validate an id's charset/length |
| `decodeResponse(base64Data)` | typed decode of the success payload → `EsewaSuccessData \| null` (no verify) |
| `verifyDecodedResponse(base64Data, secret)` | `{ valid, data }` — composes `verifyResponse`, typed `data` |
| `ESEWA_FORM_URLS` / `ESEWA_STATUS_URLS` | `{ test, prod }` endpoint maps |
| `ESEWA_TEST_SECRET` / `ESEWA_TEST_PRODUCT_CODE` | sandbox credentials |
| `ESEWA_SIGNED_FIELD_NAMES` | `"total_amount,transaction_uuid,product_code"` |

`env` is `"test"` (default) or `"prod"`. Signatures use standard base64 (not url-safe), exactly as eSewa expects.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/esewa` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
