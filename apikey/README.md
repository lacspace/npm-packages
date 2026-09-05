<div align="center">

# @lacspace/apikey

**Issue & verify API keys the right way — show once, store only the hash.**

[![npm version](https://img.shields.io/npm/v/@lacspace/apikey?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/apikey)
[![install size](https://packagephobia.com/badge?p=@lacspace/apikey)](https://packagephobia.com/result?p=@lacspace/apikey)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/apikey?label=minzip)](https://bundlephobia.com/package/@lacspace/apikey)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/apikey)
[![license](https://img.shields.io/npm/l/@lacspace/apikey?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Generate prefixed, high-entropy keys (e.g. `lac_live_…`), return the **SHA-256 hash** to store and the **last 4** to display, and verify in **constant time**. You never persist the raw key — exactly how Stripe/GitHub-style keys work.

- 🔑 `generateApiKey` → `{ key, hash, prefix, last4 }`
- ✅ `verifyApiKey` (constant-time) · `hashApiKey` · `parseApiKey`
- ⚡ Zero deps (bar `@lacspace/crypto`) · 🌍 isomorphic · fully typed

## Install

```bash
npm install @lacspace/apikey
```

## Usage

```ts
import { generateApiKey, verifyApiKey } from "@lacspace/apikey";

// on create — show `key` to the user ONCE, store the rest
const { key, hash, prefix, last4 } = await generateApiKey({ prefix: "lac_live" });
// key:  "lac_live_9f8a…"   (return to user, never store)
// hash: "3b2c…"            (store this), prefix, last4 for display

// on each request
const presented = req.headers["x-api-key"];
if (await verifyApiKey(presented, storedHash)) { /* authorized */ }
```

## API

| Export | Description |
| --- | --- |
| `generateApiKey(opts?)` | `{ key, hash, prefix, last4 }` — `prefix`, `bytes` |
| `verifyApiKey(key, storedHash)` | constant-time verify |
| `hashApiKey(key)` | SHA-256 for lookup/storage |
| `parseApiKey(key)` | `{ prefix, last4 }` |

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| **`@lacspace/apikey`** | API keys (this package) |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

## New in 1.1 — request adapters

```ts
import { extractApiKey, authenticateApiKey, expressApiKey, isValidKeyFormat } from "@lacspace/apikey";

// Pull the key from x-api-key or Authorization: Bearer
const key = extractApiKey(req);

// Verify (constant-time) against your store, with expiry + scope checks
const record = await authenticateApiKey(key ?? "", {
  resolve: ({ prefix }) => db.apiKeys.findByPrefix(prefix), // returns { hash, scopes, expiresAt }
  scopes: ["read"],
});

// Express: verifies → req.apiKey, else 401
app.use("/api", expressApiKey({ resolve: ({ prefix }) => db.apiKeys.findByPrefix(prefix) }));

isValidKeyFormat("lac_live_xxxxxxxxxxxxxxxx"); // cheap offline reject before hitting the DB
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/apikey` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/apikey
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

