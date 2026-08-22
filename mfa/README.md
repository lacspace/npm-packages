<div align="center">

# @lacspace/mfa

**Orchestrate 2FA / 3FA step-up flows with NIST assurance levels.**

[![npm version](https://img.shields.io/npm/v/@lacspace/mfa?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/mfa)
[![install size](https://packagephobia.com/badge?p=@lacspace/mfa)](https://packagephobia.com/result?p=@lacspace/mfa)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/mfa?label=minzip)](https://bundlephobia.com/package/@lacspace/mfa)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/mfa)
[![license](https://img.shields.io/npm/l/@lacspace/mfa?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The conductor for your factors. Track which factors a user has cleared, compute the **Authenticator Assurance Level** (AAL), and decide when a policy is satisfied — combining a password, a TOTP code and a passkey into 2FA or 3FA. Pair it with `@lacspace/password`, `@lacspace/otp` and `@lacspace/webauthn` to verify each factor.

- 🧩 `MfaSession` — mark factors verified, ask if the policy is satisfied
- 📊 `assuranceLevel` — AAL1 / AAL2 / AAL3 from factor types
- 🎯 Policies by min factors, min AAL, and required types
- ✅ `verifyTotpFactor` convenience (wraps `@lacspace/otp`)
- ⚡ Zero deps (bar `@lacspace/otp`) · 🌍 isomorphic · fully typed

## Install

```bash
npm install @lacspace/mfa
```

## Usage

```ts
import { mfaSession } from "@lacspace/mfa";

const session = mfaSession({
  factors: [
    { id: "password", type: "knowledge" },
    { id: "totp", type: "possession" },
    { id: "passkey", type: "inherence" },
  ],
  policy: { minFactors: 2, minAAL: 2 },
});

session.markVerified("password");
session.satisfied;          // false — one factor

session.markVerified("totp");
session.satisfied;          // true
session.aal;                // 2

// require the strongest assurance (adds a passkey → AAL3)
const step3 = session.state(); // { satisfied, aal, needFactors, needTypes, verifiedFactors }
```

Verify a TOTP factor in one call:

```ts
import { verifyTotpFactor } from "@lacspace/mfa";
if (await verifyTotpFactor(code, userSecret)) session.markVerified("totp");
```

## Assurance levels

`AAL1` a single factor · `AAL2` two distinct factor types · `AAL3` two+ including a hardware-bound inherence factor (passkey).

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| **`@lacspace/mfa`** | 2FA/3FA orchestration (this package) |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
