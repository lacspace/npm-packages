<div align="center">

# @lacspace/signed-url

**HMAC-signed, expiring URLs & tokens over Web Crypto — magic links, secure downloads, unsubscribe links, one-time actions.**

[![npm version](https://img.shields.io/npm/v/@lacspace/signed-url?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/signed-url)
[![install size](https://packagephobia.com/badge?p=@lacspace/signed-url)](https://packagephobia.com/result?p=@lacspace/signed-url)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/signed-url?label=minzip)](https://bundlephobia.com/package/@lacspace/signed-url)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/signed-url)
[![license](https://img.shields.io/npm/l/@lacspace/signed-url?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Two things every backend re-implements badly: **signed tokens** (magic-login links, email verification, unsubscribe, one-time actions) and **signed URLs** (expiring, tamper-proof download / image-proxy links — self-hosted, S3-presigned-style). This does both, correctly, in a few bytes.

- 🔐 **Tamper-proof** — any change to the data or URL breaks the signature
- ⏱️ **Expiring** — `expiresIn` / `expiresAt`, with clock-skew tolerance
- 🛡️ **Timing-safe** verification (built on [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto), Web Crypto — never hand-rolled)
- 🪄 `magicLink()` / `readMagicLink()` helpers for passwordless auth
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/signed-url      # or pnpm add / yarn add / bun add
```

## Signed tokens

```ts
import { sign, verify } from "@lacspace/signed-url";

// e.g. a password-reset link
const token = await sign({ userId: 42, action: "reset" }, {
  secret: process.env.LINK_SECRET!,
  expiresIn: 3600, // seconds
});

const r = await verify<{ userId: number; action: string }>(token, { secret: process.env.LINK_SECRET! });
if (r.valid) {
  grantReset(r.data.userId);
} else {
  // r.reason → "malformed" | "bad-signature" | "expired"
}
```

`verify()` **never throws** — it always returns `{ valid, data?, reason?, expiresAt? }`.

## Magic links (passwordless auth)

```ts
import { magicLink, readMagicLink } from "@lacspace/signed-url";

// send this link by email
const link = await magicLink("https://app.me/auth/callback", { email }, {
  secret, expiresIn: 900,
});

// in your callback route
const r = await readMagicLink<{ email: string }>(request.url, { secret });
if (r.valid) signIn(r.data.email);
```

## Signed URLs (expiring, tamper-proof download links)

```ts
import { signUrl, verifyUrl } from "@lacspace/signed-url";

// hand out a link that stops working in 5 minutes
const link = await signUrl("https://cdn.me/files/report.pdf?uid=42", {
  secret, expiresIn: 300,
});
// → https://cdn.me/files/report.pdf?uid=42&exp=1699999999&sig=AbC…

// in the route that serves the file
const r = await verifyUrl(request.url, { secret });
if (!r.valid) return new Response("Link expired or invalid", { status: 403 });
```

Query-param order is normalised, so the link verifies no matter how params get reordered — and changing the path or **any** param invalidates it.

## API

| Function | Description |
| --- | --- |
| `sign(data, { secret, expiresIn?, expiresAt?, algorithm? })` | data → compact signed token |
| `verify(token, { secret, clockToleranceSec? })` | `{ valid, data?, reason?, expiresAt? }` |
| `isValid(token, opts)` | `boolean` convenience |
| `signUrl(url, { secret, expiresIn? })` | append `exp` + `sig` params |
| `verifyUrl(url, { secret })` | verify signature + expiry |
| `magicLink(baseUrl, data, opts)` | base URL + signed `token` param |
| `readMagicLink(url, opts)` | verify the embedded token |

`reason` is one of `"malformed" | "bad-signature" | "expired"`. Default algorithm is `SHA-256` (`SHA-384` / `SHA-512` also supported).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/signed-url` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/signed-url
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

