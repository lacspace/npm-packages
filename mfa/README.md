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
- 🆕 Enrollment flow, step-up decisions, lockout policy, trusted-device tokens, recovery codes (**New in 1.2.0**)
- ⚡ Zero deps (bar `@lacspace/otp`) · 🌍 isomorphic · fully typed

> **New in 1.2.0** — adapter-based flow helpers, all self-contained (no new dependencies):
> `beginEnrollment`/`completeEnrollment`, `requireStepUp`, `evaluateLockout`, `issueTrustedDevice`/`verifyTrustedDevice`,
> and a dependency-free recovery-code factor (`generateRecoveryCodes`/`verifyRecoveryCode`/`consumeRecoveryCode`).

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

## New in 1.1 — factor verifiers & persistable sessions

```ts
import { mfaSession, MfaSession, verifyPasswordFactor, verifyTotpFactor, verifyBackupCodeFactor } from "@lacspace/mfa";

// Verify each factor with one call (wraps @lacspace/password + @lacspace/otp)
if (await verifyPasswordFactor(password, user.hash)) session.markVerified("password");
if (await verifyTotpFactor(code, user.totpSecret)) session.markVerified("totp");

// Persist step-up state across requests (signed cookie / store)
const saved = JSON.stringify(session.toJSON());
const session2 = MfaSession.fromJSON(config, JSON.parse(saved));

// Step-up windows: verified factors expire after factorTtlMs
const s = mfaSession({ factors, policy: { minAAL: 2 }, factorTtlMs: 5 * 60_000 });
```

## New in 1.2.0 — enrollment, step-up, lockout, trusted devices & recovery codes

All additive, zero new dependencies, and **adapter-based** — you own the crypto/verification, these helpers own the flow and the data shapes.

### Enrollment flow (`started → challenged → confirmed`)

```ts
import { beginEnrollment, challengeEnrollment, completeEnrollment } from "@lacspace/mfa";

let en = beginEnrollment({ id: "totp", type: "possession" });
en = challengeEnrollment(en, totpSecret);              // attach material you generated
const { state, record } = completeEnrollment(en, userProvedIt);
// record = { factorId, type, secret, enrolledAt } — persist it however you like
```

### Step-up authentication

```ts
import { requireStepUp } from "@lacspace/mfa";

const decision = requireStepUp(session, { minAAL: 2, maxAgeMs: 5 * 60_000, requireTypes: ["inherence"] });
if (decision.required) promptForFactor(decision.reasons); // ["insufficient-aal" | "stale" | "missing-type" | ...]
```

### Lockout / rate-limit policy (pure, injectable clock)

```ts
import { evaluateLockout, recordFailure, recordSuccess, initialLockoutState } from "@lacspace/mfa";

const policy = { maxAttempts: 5, cooldownMs: 30_000, backoffFactor: 2, maxCooldownMs: 15 * 60_000 };
let state = loadState() ?? initialLockoutState();

const { allowed, retryAfter, remaining } = evaluateLockout(state, policy, Date.now());
if (!allowed) throw new Error(`locked — retry in ${retryAfter}ms`);
state = ok ? recordSuccess() : recordFailure(state, policy, Date.now());
```

### Trusted-device tokens (Web Crypto HMAC, injectable secret)

```ts
import { issueTrustedDevice, verifyTrustedDevice } from "@lacspace/mfa";

const token = await issueTrustedDevice({ sub: userId, device: deviceId, secret: env.DEVICE_SECRET, ttlMs: 30 * 864e5 });
// later, on a new login:
const claims = await verifyTrustedDevice(token, env.DEVICE_SECRET, { sub: userId, device: deviceId });
if (claims) skipMfa(); // valid, unexpired, matches this user + device
```

### Recovery-code factor (self-contained, salted SHA-256)

```ts
import { generateRecoveryCodes, consumeRecoveryCode } from "@lacspace/mfa";

const { codes, hashes } = await generateRecoveryCodes({ count: 10 }); // show `codes` once, store `hashes`
const { consumed, remaining } = await consumeRecoveryCode(input, hashes); // single-use; persist `remaining`
```

### API added in 1.2.0

| Export | Signature | Does |
| --- | --- | --- |
| `beginEnrollment` | `(factor, opts?) → EnrollmentState` | Start enrolling a factor |
| `challengeEnrollment` | `(state, challenge, opts?) → EnrollmentState` | Attach challenge material |
| `completeEnrollment` | `(state, verified, opts?) → { state, record? }` | Confirm/fail, yield stored record |
| `requireStepUp` | `(session, policy?) → StepUpDecision` | Whether a fresh challenge is needed |
| `evaluateLockout` | `(state, policy?, now?) → { allowed, retryAfter, remaining }` | Pure lockout verdict |
| `recordFailure` / `recordSuccess` | `(state, policy?, now?) → state` / `() → state` | Advance lockout state |
| `initialLockoutState` | `() → LockoutStateData` | Fresh lockout counter |
| `issueTrustedDevice` | `(opts) → Promise<string>` | Signed remember-device token |
| `verifyTrustedDevice` | `(token, secret, opts?) → Promise<claims \| null>` | Verify token + expiry |
| `generateRecoveryCodes` | `(opts?) → Promise<{ codes, hashes }>` | Mint recovery codes |
| `verifyRecoveryCode` | `(code, hashes) → Promise<number>` | Matched index or -1 |
| `consumeRecoveryCode` | `(code, hashes) → Promise<{ consumed, index, remaining }>` | Single-use consume |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/mfa` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/mfa
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

