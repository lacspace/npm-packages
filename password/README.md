<div align="center">

# @lacspace/password

**Password hashing & verification — PBKDF2 with a portable PHC string.**

[![npm version](https://img.shields.io/npm/v/@lacspace/password?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/password)
[![install size](https://packagephobia.com/badge?p=@lacspace/password)](https://packagephobia.com/result?p=@lacspace/password)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/password?label=minzip)](https://bundlephobia.com/package/@lacspace/password)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/password)
[![license](https://img.shields.io/npm/l/@lacspace/password?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Hash and verify passwords with **PBKDF2-HMAC-SHA256** (600,000 iterations by default, per OWASP) over Web Crypto — correct and isomorphic. Self-describing PHC string, constant-time verify, rehash detection and a strength estimator. Never store plaintext.

- 🔒 `hash` / `verify` (constant-time) with a portable `$pbkdf2-sha256$…` string
- ♻️ `needsRehash` — upgrade work factor on next login
- 📏 `strength` — quick 0–4 score with warnings
- ⚡ Zero deps (bar `@lacspace/crypto`) · 🌍 isomorphic · fully typed

## Install

```bash
npm install @lacspace/password
```

## Usage

```ts
import { hash, verify, needsRehash, strength } from "@lacspace/password";

const stored = await hash("correct horse battery staple");
// "$pbkdf2-sha256$i=600000$<salt>$<hash>"  — store this string

await verify("correct horse battery staple", stored); // true
await verify("wrong", stored);                          // false

if (needsRehash(stored)) { /* re-hash with current params after a successful login */ }

strength("password");        // { score: 0, warnings: ["This is a very common password."] }
strength("Tr0ub4dour&3xy");  // { score: 4, warnings: [] }
```

## API

| Export | Description |
| --- | --- |
| `hash(password, opts?)` | PHC-string hash (`iterations`, `saltBytes`) |
| `verify(password, stored)` | constant-time check |
| `needsRehash(stored, iterations?)` | true if below target work factor |
| `strength(password)` | `{ score, length, warnings }` |

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| **`@lacspace/password`** | Password hashing (this package) |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
