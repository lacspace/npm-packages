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

> **New in 1.1.0** — an additive *secure layer* (`signSecure` / `verifySecure` / `signSecureUrl` / `verifySecureUrl`) adding **key rotation** (named secrets), **binding** (method / IP / path-prefix), a **single-use nonce** + `consumeNonce` checker, a **`clockTolerance`** leeway, and **signed claims**. Every existing helper is unchanged and cross-compatible with the new one.

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

## Secure layer — rotation, binding, nonce, claims (new in 1.1.0)

`signSecure` / `verifySecure` are a drop-in superset of `sign` / `verify` (same token
format, cross-compatible), and `signSecureUrl` / `verifySecureUrl` do the same for URLs.
Everything below is optional — omit it all and you get the classic behaviour.

```ts
import { signSecure, verifySecure, consumeNonce } from "@lacspace/signed-url";

// Key rotation: sign with the active key, verify against the whole set.
const token = await signSecure({ userId: 42 }, {
  keys: { "2024": OLD_SECRET, "2025": NEW_SECRET },
  keyId: "2025",                              // stamped into the signature
  bind: { method: "POST", ip: req.ip, pathPrefix: "/admin/" }, // constraints
  nonce: true,                                // random single-use nonce
  claims: { role: "owner" },                  // tamper-proof metadata
  expiresIn: 900,
});

const r = await verifySecure(token, {
  keys: { "2024": OLD_SECRET, "2025": NEW_SECRET }, // rotate secrets freely
  context: { method: req.method, ip: req.ip, path: url.pathname }, // enforced
  clockTolerance: 30,                         // 30s leeway on expiry
});
if (r.valid) {
  // r.data, r.claims, r.nonce, r.keyId
  // Enforce one-time use with YOUR store (library owns no storage):
  const prior = await store.get(r.nonce!);           // number | undefined
  const c = consumeNonce(prior, { maxUses: 1 });
  if (!c.ok) return reject("already used");
  await store.set(r.nonce!, c.uses);
}
// r.reason may also be "unknown-key" (wrong key set) or "binding" (constraint mismatch).
```

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
| `signSecure(data, { secret? \| keys?+keyId?, bind?, nonce?, claims?, ...expiry })` | token + rotation / binding / nonce / claims |
| `verifySecure(token, { secret? \| keys?, context?, clockTolerance?, ... })` | `{ valid, data?, claims?, nonce?, keyId?, reason?, expiresAt? }` |
| `signSecureUrl(url, opts)` / `verifySecureUrl(url, opts)` | the same, for URLs |
| `generateNonce(bytes?)` | random hex nonce (default 16 bytes) |
| `consumeNonce(previousUses?, { maxUses? })` | pure single-use / max-N checker → `{ ok, uses, remaining }` |

`reason` is one of `"malformed" | "bad-signature" | "expired"` (classic) plus `"unknown-key" | "binding"` (secure layer). Default algorithm is `SHA-256` (`SHA-384` / `SHA-512` also supported).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/signed-url` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/signed-url
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

