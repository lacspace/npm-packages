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

## API

| Export | Description |
| --- | --- |
| `signRequest(params, secret)` | HMAC-SHA512 (hex) request `DV`. `MD` → `"P"`, `CRN` → `"NPR"` by default. |
| `buildRedirect(params, { secret, env? })` | `{ url, params, dv }` — the full gateway URL with all fields + `DV`. |
| `verifyResponse(resp, secret)` | `{ valid }` — constant-time verify of the response `DV`. |
| `GATEWAY_URL` | `{ test, prod }` endpoint map. |

`env` defaults to `"test"` (dev gateway). Keep your Fonepay **secret** on the server only.

---

## The Lacspace Developer Platform

`@lacspace/fonepay` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
