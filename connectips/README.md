<div align="center">

# @lacspace/connectips

**Connect IPS (Nepal) merchant integration over Web Crypto — RSA-signed redirect tokens + server-to-server transaction validation.**

[![npm version](https://img.shields.io/npm/v/@lacspace/connectips?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/connectips)
[![install size](https://packagephobia.com/badge?p=@lacspace/connectips)](https://packagephobia.com/result?p=@lacspace/connectips)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/connectips?label=minzip)](https://bundlephobia.com/package/@lacspace/connectips)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/connectips)
[![license](https://img.shields.io/npm/l/@lacspace/connectips?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> [Connect IPS](https://www.connectips.com/) is Nepal's inter-bank payment gateway (operated by NCHL). Integrating it means building an exact `KEY=VALUE,…,TOKEN=TOKEN` message, signing it with your merchant **RSA private key** (RSA-SHA256), redirecting the payer, and later validating the transaction server-to-server. This package does all of that correctly.

- 🔐 **RSA-SHA256** (RSASSA-PKCS1-v1_5) signing straight from a **PKCS#8 PEM** private key
- 🧾 Canonical token message built for you — no fragile string concatenation
- 🔁 `buildForm()` for the redirect and `validateTxn()` for the callback check
- 🛡️ Built on **Web Crypto** (`globalThis.crypto.subtle`) — never hand-rolled cryptography
- ⚡ Isomorphic — Node 20+, edge runtimes & browsers · 📦 ESM + CJS · fully typed · **zero dependencies**

> **New in 1.1.0** — additive, fully backward compatible. Pure canonical message-string builders you can inspect (`paymentTokenMessage`, `validationTokenMessage`), a no-network `buildValidationRequest()` that signs the validate-txn payload for you to POST yourself, offline field validation (`validateRequest`), a `ValidateTxnResponse` type, and an `ENDPOINTS` preset. The existing `signToken` / `buildForm` / `validateTxn` signing is unchanged.

## Install

```bash
npm install @lacspace/connectips      # or pnpm add / yarn add / bun add
```

## Redirect the payer

```ts
import { buildForm } from "@lacspace/connectips";

const form = await buildForm(
  {
    MERCHANTID: "123",
    APPID: "APP123",
    APPNAME: "lacspace-shop",
    TXNID: "TXN001",
    TXNDATE: "05-09-2026",
    TXNCRNCY: "NPR",
    TXNAMT: 100000, // paisa
    REFERENCEID: "REF001",
    REMARKS: "order-1",
    PARTICULARS: "order-1",
  },
  { privateKeyPem: process.env.CONNECTIPS_PRIVATE_KEY_PEM!, env: "prod" },
);

// Render an auto-submitting form:
// <form action={form.action} method="POST">
//   {Object.entries(form.fields).map(([k, v]) => <input type="hidden" name={k} value={v} />)}
// </form>
```

`form.fields` is your transaction params plus a base64 `TOKEN` (the RSA-SHA256 signature over the canonical message ending in the literal `TOKEN=TOKEN`).

## Validate the transaction (server-to-server)

```ts
import { validateTxn } from "@lacspace/connectips";

const result = await validateTxn(
  { merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 },
  {
    user: process.env.CONNECTIPS_API_USER!,
    password: process.env.CONNECTIPS_API_PASSWORD!,
    privateKeyPem: process.env.CONNECTIPS_PRIVATE_KEY_PEM!,
    env: "prod",
  },
);
// POSTs { merchantId, appId, referenceId, txnAmt, token } with a Basic-auth header
```

The validation `token` signs `MERCHANTID=…,APPID=…,REFERENCEID=…,TXNAMT=…`.

## Just the token

```ts
import { signToken } from "@lacspace/connectips";

const token = await signToken(params, privateKeyPem); // base64 RSA-SHA256 signature
```

## Validate without our fetch (build the request yourself)

```ts
import { buildValidationRequest } from "@lacspace/connectips";

const req = await buildValidationRequest(
  { merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 },
  { privateKeyPem, env: "prod", user, password }, // user+password → Basic auth header
);
// { url, method: "POST", headers, body: { merchantId, appId, referenceId, txnAmt, token }, token }
await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) });
```

It signs the exact same canonical validation message as `validateTxn()`, but does no network — you own the request (retries, logging, custom runtimes).

## Inspect the exact signed message + validate fields

```ts
import { paymentTokenMessage, validationTokenMessage, validateRequest } from "@lacspace/connectips";

paymentTokenMessage(params);      // "MERCHANTID=…,…,PARTICULARS=…,TOKEN=TOKEN" (exactly what signToken signs)
validationTokenMessage(vparams);  // "MERCHANTID=…,APPID=…,REFERENCEID=…,TXNAMT=…"

const { valid, errors } = validateRequest(params); // paisa integer TXNAMT, DD-MM-YYYY date, id charset, NPR…
if (!valid) throw new Error(errors.join("; "));
```

## API

| Export | Description |
| --- | --- |
| `signToken(params, privateKeyPem)` | Base64 RSA-SHA256 signature of the canonical redirect message. |
| `buildForm(params, { privateKeyPem, env? })` | `{ action, method: "POST", fields }` — params + signed `TOKEN`. |
| `validateTxn(params, { user, password, privateKeyPem, env?, fetch? })` | POSTs the validation payload with Basic auth; returns the parsed response. |
| `verifyToken(message, signatureB64, publicKeyPem)` | Verify an RSA-SHA256 signature against an SPKI PEM public key. |
| `buildValidationRequest(params, { privateKeyPem, env?, user?, password? })` | **1.1.0** — pure (no network) signed validate-txn request `{ url, method, headers, body, token }`. |
| `paymentTokenMessage(params)` | **1.1.0** — the exact canonical redirect message string that gets signed. |
| `validationTokenMessage(params)` | **1.1.0** — the exact canonical validation message string that gets signed. |
| `validateRequest(params)` | **1.1.0** — pure field validation → `{ valid, errors }` (paisa TXNAMT, DD-MM-YYYY, id charset, NPR). |
| `LOGIN_URL`, `VALIDATE_URL`, `ENDPOINTS` | `{ test, prod }` endpoint maps; `ENDPOINTS[env]` groups `{ login, validate }`. |
| `ValidateTxnResponse`, `ValidationResult`, `ValidationRequest` | **1.1.0** — response/result/request types. |

`env` defaults to `"test"` (UAT). All signing uses your PKCS#8 PEM private key; all HTTP goes through the global `fetch` (injectable for tests).

## Security notes

- Keep your **RSA private key** on the server only — never ship it to the browser.
- The signed message must match Connect IPS's expected field order exactly; this package builds it for you.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/connectips` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
