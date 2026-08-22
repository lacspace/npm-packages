<div align="center">

# @lacspace/otp

**TOTP & HOTP two-factor auth — Google Authenticator compatible, runs everywhere.**

[![npm version](https://img.shields.io/npm/v/@lacspace/otp?color=%230ea5e9&label=npm)](https://www.npmjs.com/package/@lacspace/otp)
[![install size](https://packagephobia.com/badge?p=@lacspace/otp)](https://packagephobia.com/result?p=@lacspace/otp)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/otp?label=minzip)](https://bundlephobia.com/package/@lacspace/otp)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/otp)
[![license](https://img.shields.io/npm/l/@lacspace/otp?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Generate secrets, compute & verify **TOTP** (RFC 6238) and **HOTP** (RFC 4226) codes, and build the `otpauth://` URI you turn into a QR code. Built on the **Web Crypto API**, so the same code runs on **Node 18+, edge runtimes and the browser** — no `crypto` polyfills, no native deps. Verified against the official RFC test vectors.

- 🔐 `totp` / `hotp` + `verifyTotp` / `verifyHotp` (timing-safe, clock-drift window)
- 🔑 `generateSecret()` (CSPRNG) · base32 encode/decode
- 📱 `keyuri()` → `otpauth://` for Google Authenticator, Authy, 1Password…
- ⏱️ `timeRemaining()` for countdown UIs
- ⚡ Zero dependencies · 🌍 isomorphic (Web Crypto) · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/otp      # or pnpm add / yarn add / bun add
```

## Enroll a user

```ts
import { generateSecret, keyuri } from "@lacspace/otp";

const secret = generateSecret();            // store this (encrypted) against the user
const uri = keyuri({ secret, label: "user@lacspace.com", issuer: "Lacspace" });
// otpauth://totp/Lacspace:user@lacspace.com?secret=…&issuer=Lacspace&algorithm=SHA1&digits=6&period=30
// → render `uri` as a QR code for the user to scan
```

## Verify a login code

```ts
import { verifyTotp } from "@lacspace/otp";

const offset = await verifyTotp(submittedCode, secret); // tolerates ±1 time step by default
if (offset === null) throw new Error("Invalid or expired code");
// offset: 0 = current window, -1/+1 = adjacent (clock drift)
```

## Countdown UI

```ts
import { totp, timeRemaining } from "@lacspace/otp";

await totp(secret);       // current 6-digit code
timeRemaining();          // seconds until it rolls over
```

## HOTP (counter-based)

```ts
import { hotp, verifyHotp } from "@lacspace/otp";

await hotp(secret, counter);
const matched = await verifyHotp(code, secret, counter, { window: 5 }); // scan ahead 5
```

## Options

All functions accept `{ digits, algorithm }` (and TOTP adds `period`, `timestamp`):

```ts
await totp(secret, { digits: 8, period: 60, algorithm: "SHA-256" });
await verifyTotp(code, secret, { window: 2 });
```

> **Compatibility:** defaults (`SHA-1`, 6 digits, 30s) match Google Authenticator, Authy and most apps.

## The Lacspace WebKit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) | Typed env variables |
| [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) | Rate limiting |
| **`@lacspace/otp`** | TOTP/HOTP 2FA (this package) |
| [`@lacspace/next`](https://www.npmjs.com/package/@lacspace/next) | Next.js SDK integration |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
