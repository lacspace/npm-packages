<div align="center">

# @lacspace/crypto

**Safe, boring cryptography — authenticated AES-256-GCM, key derivation, hashing.**

[![npm version](https://img.shields.io/npm/v/@lacspace/crypto?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/crypto)
[![install size](https://packagephobia.com/badge?p=@lacspace/crypto)](https://packagephobia.com/result?p=@lacspace/crypto)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/crypto?label=minzip)](https://bundlephobia.com/package/@lacspace/crypto)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/crypto)
[![license](https://img.shields.io/npm/l/@lacspace/crypto?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A thin, correct layer over the **Web Crypto API** — no hand-rolled crypto. Authenticated **AES-256-GCM**, PBKDF2 key derivation, SHA-256/384/512, HMAC, secure random and constant-time compare. Same code on Node 18+, edge, browsers and React Native. Encrypt database fields, S3 payloads, cookies and tokens.

- 🔐 `encrypt` / `decrypt` — AES-256-GCM (authenticated: tampering is rejected)
- 🔑 `encryptWithPassword` / `decryptWithPassword` — PBKDF2-derived key, self-contained
- #️⃣ `sha256` / `digest` / `hmac` / `hmacVerify`
- 🎲 `randomBytes` · `generateKey` · `constantTimeEqual`
- 🧰 hex / base64url helpers
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/crypto      # or pnpm add / yarn add / bun add
```

## Encrypt with a key

```ts
import { generateKey, encrypt, decrypt } from "@lacspace/crypto";

const key = generateKey();                 // 256-bit base64url key — store securely
const blob = await encrypt("card: 4242…", key);
// "v1:<iv>:<ciphertext+tag>"  — safe to store in Mongo / S3
const plain = await decrypt(blob, key);    // "card: 4242…"
```

Encrypt a field before saving to MongoDB, or an object before putting it on S3:

```ts
await s3.putObject({ Bucket, Key, Body: await encrypt(JSON.stringify(doc), key) });
```

## Encrypt with a passphrase

```ts
import { encryptWithPassword, decryptWithPassword } from "@lacspace/crypto";

const sealed = await encryptWithPassword("secret", userPassphrase);
// "v1p:<iterations>:<salt>:<iv>:<ciphertext>" — fully self-describing
const opened = await decryptWithPassword(sealed, userPassphrase);
```

## Hashing, HMAC & helpers

```ts
import { sha256, hmac, hmacVerify, constantTimeEqual, randomBytes } from "@lacspace/crypto";

await sha256("hello");                       // hex digest
const sig = await hmac(secret, "payload");   // Uint8Array
await hmacVerify(secret, "payload", sig);    // true (constant-time)
constantTimeEqual(a, b);                     // timing-safe compare
randomBytes(16);                             // CSPRNG bytes
```

## API

| Export | Description |
| --- | --- |
| `encrypt` / `decrypt` | AES-256-GCM with a 32-byte key |
| `encryptWithPassword` / `decryptWithPassword` | passphrase (PBKDF2 + AES-GCM) |
| `generateKey` | random 256-bit key (base64url) |
| `sha256` / `sha384` / `sha512` / `digest` | hashing |
| `hmac` / `hmacHex` / `hmacBase64url` / `hmacVerify` | MAC (bytes / hex / base64url) |
| `hkdf` / `deriveBits` | HKDF & PBKDF2 key derivation |
| `Keyring` | versioned keys for zero-downtime rotation |
| `randomBytes` / `randomString` / `randomUUID` / `randomInt` | secure random (unbiased) |
| `constantTimeEqual` / `timingSafeEqual` | timing-safe compare |
| `toHex` / `fromHex` / `toBase64url` / `fromBase64url` / `toBase64` / `fromBase64` | encoding |

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| **`@lacspace/crypto`** | AES encryption & hashing (this package) |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

## New in 1.1 — AAD, HKDF & key rotation

```ts
import { encrypt, decrypt, hkdf, Keyring } from "@lacspace/crypto";

// Bind ciphertext to a context so it can't be relocated to another row
const blob = await encrypt(secret, key, { aad: `user:${id}` });
await decrypt(blob, key, { aad: `user:${id}` });   // must match

// Derive many purpose-bound sub-keys from one master key
const encKey = await hkdf(master, { info: "field-encryption", length: 32 });

// Zero-downtime key rotation — new writes use the primary, old blobs still decrypt
const ring = new Keyring([{ id: "2025", key: oldKey }, { id: "2026", key: newKey }]);
const fresh = await ring.encrypt("secret");        // v2:2026:…
const text = await ring.decrypt(oldBlob);          // finds the key by id
const migrated = await ring.reEncrypt(oldBlob);    // re-key to primary
```

Also `decryptBytes()` for binary-safe payloads (files, protobufs).

## New in 1.2 — more hashing, base64 & secure random

```ts
import {
  timingSafeEqual, sha384, sha512, hmacHex, hmacBase64url,
  toBase64, fromBase64, randomString, randomUUID, randomInt,
} from "@lacspace/crypto";

timingSafeEqual(a, b);                       // alias for constantTimeEqual
await sha384("hi"); await sha512("hi");      // hex digests (SHA-256 already existed)
await hmacHex(secret, "payload");            // HMAC as hex
await hmacBase64url(secret, "payload");      // HMAC as base64url

toBase64(bytes); fromBase64("aGVsbG8=");     // standard (padded) base64

randomString(24);                            // 24-char URL-safe base62 token
randomString(6, "0123456789");               // custom alphabet (unbiased)
randomUUID();                                // RFC-4122 v4 UUID
randomInt(6);                                // unbiased int in [0, 6)
randomInt(100, 200);                         // unbiased int in [100, 200)
```

All random helpers use the platform CSPRNG with rejection sampling, so there is no modulo bias.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/crypto` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/crypto
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

