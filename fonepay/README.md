<div align="center">

# @lacspace/fonepay

**Fonepay (Nepal) merchant redirect / Request-To-Pay over Web Crypto — HMAC-SHA512 request signing + response verification.**

[![npm version](https://img.shields.io/npm/v/@lacspace/fonepay?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/fonepay)
[![install size](https://packagephobia.com/badge?p=@lacspace/fonepay)](https://packagephobia.com/result?p=@lacspace/fonepay)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/fonepay?label=minzip)](https://bundlephobia.com/package/@lacspace/fonepay)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/fonepay)
[![license](https://img.shields.io/npm/l/@lacspace/fonepay?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> [Fonepay](https://fonepay.com/) merchant redirect ("Request-To-Pay") signs the request with an **HMAC-SHA512** data-validation field (`DV`) over the request values in an exact order, and returns a `DV` on the response you must verify the same way. This package computes both — correctly, in a few bytes.

> **New in 1.1.0** — all additive, the existing DV/hash/sign/verify are byte-for-byte unchanged: `verifyResponseResult()` (verify with a failure reason), `buildFormPost()` (auto-submit form pieces), `buildQrRequest()` (dynamic-QR payload + DV), `validateRequest()` + field validators, `generatePrn()` (CSPRNG), `SANDBOX_GATEWAY_URL` / `LIVE_GATEWAY_URL` presets and the low-level `dvHash()` primitive.

- 🔐 **HMAC-SHA512** (lowercase hex) over the fields in Fonepay's exact order
- 🔁 `buildRedirect()` assembles the full urlencoded gateway URL (incl. `DV`)
- ✅ `verifyResponse()` recomputes the response `DV` with a **constant-time** compare
- 🛡️ Built on **Web Crypto** (`globalThis.crypto.subtle`) — never hand-rolled cryptography
- ⚡ Isomorphic — Node 20+, edge runtimes & browsers · 📦 ESM + CJS · fully typed · **zero dependencies**

## Install

```bash
npm install @lacspace/fonepay      # or pnpm add / yarn add / bun add
```

## Redirect the payer

```ts
import { buildRedirect } from "@lacspace/fonepay";

const { url } = await buildRedirect(
  {
    PID: "MERCHANT",         // merchant code
    PRN: "prn-0001",         // unique product/reference number
    AMT: 1000,               // amount
    DT: "09/05/2026",        // date
    R1: "order note",
    R2: "buyer ref",
    RU: "https://shop.me/fonepay/return", // return URL
    // MD defaults to "P", CRN defaults to "NPR"
  },
  { secret: process.env.FONEPAY_SECRET!, env: "prod" },
);

return Response.redirect(url, 302);
```

The signed message is HMAC-SHA512 over `PID,MD,PRN,AMT,CRN,DT,R1,R2,RU` (joined by `,`), emitted as lowercase hex — the `DV` param.

## Verify the response

```ts
import { verifyResponse } from "@lacspace/fonepay";

// query = the params Fonepay sent back to your return URL
const { valid } = await verifyResponse(
  {
    PRN: query.PRN, PID: query.PID, PS: query.PS, RC: query.RC,
    UID: query.UID, BC: query.BC, INI: query.INI,
    P_AMT: query.P_AMT, R_AMT: query.R_AMT, DV: query.DV,
  },
  process.env.FONEPAY_SECRET!,
);

if (!valid) return new Response("Invalid Fonepay response", { status: 400 });
```

The response `DV` is HMAC-SHA512 over `PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT` — recomputed and compared in constant time.

## Just the signature

```ts
import { signRequest } from "@lacspace/fonepay";

const dv = await signRequest(params, secret); // 128-char lowercase hex
```

## New helpers (1.1.0)

```ts
import {
  verifyResponseResult, buildFormPost, buildQrRequest,
  validateRequest, generatePrn, SANDBOX_GATEWAY_URL, LIVE_GATEWAY_URL,
} from "@lacspace/fonepay";

// 1. Verify with a reason on failure
const { ok, reason } = await verifyResponseResult(query, secret);
// reason: "missing-response" | "missing-dv" | "signature-mismatch"

// 2. Auto-submitting HTML form instead of a redirect
const { action, fields } = await buildFormPost(params, { secret, env: "prod" });
// render <form method="POST" action={action}> with one hidden input per field

// 3. Dynamic-QR (thirdparty) payload + its dataValidation DV
const { params: qp, dv } = await buildQrRequest(
  { merchantCode: "MERCHANT", amount: 1000, prn: generatePrn("QR-"), remarks1: "coffee" },
  secret,
);

// 4. Validate before signing (pure, offline)
const { valid, issues } = validateRequest(params);
```

## API

| Export | Description |
| --- | --- |
| `signRequest(params, secret)` | HMAC-SHA512 (hex) request `DV`. `MD` → `"P"`, `CRN` → `"NPR"` by default. |
| `buildRedirect(params, { secret, env? })` | `{ url, params, dv }` — the full gateway URL with all fields + `DV`. |
| `verifyResponse(resp, secret)` | `{ valid }` — constant-time verify of the response `DV`. |
| `GATEWAY_URL` | `{ test, prod }` endpoint map. |
| `dvHash(secret, message)` | Low-level: the exact HMAC-SHA512-hex primitive behind every `DV`. |
| `verifyResponseResult(resp, secret)` | `{ ok, reason? }` — verify with a failure reason. Composes `verifyResponse`. |
| `buildFormPost(params, { secret, env? })` | `{ action, fields, dv }` — pieces for an auto-submitting form POST. |
| `buildQrRequest(qr, secret)` | `{ params, dv }` — dynamic-QR payload + `dataValidation`. |
| `validateRequest(params)` | `{ valid, issues }` — PRN shape, amount (≤2 dp), `DT` MM/DD/YYYY, R1/R2 limits, PID/RU. |
| `isValidAmount` / `isValidRequestDate` / `isValidPrn` | Individual field validators. |
| `generatePrn(prefix?)` | CSPRNG-backed unique `PRN`. |
| `SANDBOX_GATEWAY_URL` / `LIVE_GATEWAY_URL` / `FIELD_LIMITS` | Config presets. |

`env` defaults to `"test"` (dev gateway). Keep your Fonepay **secret** on the server only.

> The dynamic-QR field order (`merchantCode,amount,prn,remarks1,remarks2`) can vary by merchant onboarding — confirm it against your Fonepay thirdparty-QR API document before going live.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/fonepay` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
