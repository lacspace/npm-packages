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
| `sha256` / `digest` / `hmac` / `hmacVerify` | hashing & MAC |
| `deriveBits` | PBKDF2 key derivation |
| `randomBytes` / `constantTimeEqual` | primitives |
| `toHex` / `fromHex` / `toBase64url` / `fromBase64url` | encoding |

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

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
