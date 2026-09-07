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

> **New in 1.3.0** — a storage-agnostic key-record toolkit: public `fingerprint`/`maskKey` labels, hierarchical `hasScope` (`billing:*`), `isExpired`, `rotateApiKey` with a grace window, `isRevoked`/revocation lists, and `verifyKeyAgainst` (tells you *which* stored key matched, so you can update last-used). All additive — every 1.x export is unchanged.

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

## New in 1.3 — key records (scopes · expiry · rotation · revocation)

Storage-agnostic: the library hashes & checks, **you** persist the record.

```ts
import {
  generateApiKey, fingerprint, maskKey,
  hasScope, isExpired, isRevoked, revoke, revocationList, isRevokedId,
  rotateApiKey, verifyKeyAgainst, markUsed,
} from "@lacspace/apikey";

// identify a key in logs/UI without revealing the secret
const { key, hash } = await generateApiKey({ prefix: "sk_live" });
await fingerprint(key); // "fp_3b2c4d5e6f70"  (stable, non-reversible)
maskKey(key);           // "sk_live_••••abcd"

// hierarchical / wildcard scopes
hasScope({ scopes: ["billing:*"] }, "billing:read"); // true
hasScope(["*"], "anything");                          // true

// expiry (same boundary as authenticateApiKey: expired iff now > expiresAt)
isExpired({ hash, expiresAt: Date.now() - 1 }); // true

// rotation with a grace window — old key keeps working for 24h
let record = { id: "k1", hash, prefix: "sk_live", scopes: ["read"] };
const rot = await rotateApiKey(record, { graceMs: 86_400_000 });
// show rot.key once; persist rot.record (new hash + previousHash during grace)

// verify against your stored records → learn WHICH one matched, then update last-used
const match = await verifyKeyAgainst(rot.key, [rot.record], { active: true });
if (match) await save(markUsed(match.record)); // match.matched: "current" | "previous"

// revocation
record = revoke(record);                 // { ...record, revoked: true, revokedAt }
isRevoked(record);                       // true
const denylist = revocationList(["k9"]); // Set-backed lookup
isRevokedId("k1", denylist);             // false
```

| Export | Description |
| --- | --- |
| `fingerprint(key, opts?)` | short, stable, non-reversible public id (`fp_…`) for logs/UI |
| `parseKey(key)` | `{ prefix, secret, last4 }` |
| `maskKey(key, opts?)` | display-safe `"<prefix>_••••<last4>"` |
| `hasScope(rec\|scopes, scope)` | wildcard/hierarchical scope check (`*`, `billing:*`, parent) |
| `hasAllScopes` / `hasAnyScope` | all- / any-of scope checks · `scopeSatisfies(granted, required)` |
| `isExpired(rec, now?)` | `now > expiresAt` (matches `authenticateApiKey`) |
| `isRevoked(rec, now?)` · `revoke(rec, now?)` | revocation flag/time · pure revoke helper |
| `isRevokedId(id, list)` · `revocationList(ids)` | revocation-list lookup |
| `rotateApiKey(rec, opts?)` | new secret, same id/metadata, optional `graceMs` window |
| `verifyRecord(key, rec, opts?)` | verify one record → `{ record, matched }` \| `null` (honours grace) |
| `verifyKeyAgainst(key, records, opts?)` | verify many → first match (`active` skips expired/revoked) |
| `markUsed(rec, now?)` | copy with `lastUsedAt` set |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/apikey` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/apikey
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

