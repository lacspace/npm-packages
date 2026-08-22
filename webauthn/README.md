<div align="center">

# @lacspace/webauthn

**Passkeys & biometric (FaceID, fingerprint, security keys) via WebAuthn.**

[![npm version](https://img.shields.io/npm/v/@lacspace/webauthn?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/webauthn)
[![install size](https://packagephobia.com/badge?p=@lacspace/webauthn)](https://packagephobia.com/result?p=@lacspace/webauthn)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/webauthn?label=minzip)](https://bundlephobia.com/package/@lacspace/webauthn)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/webauthn)
[![license](https://img.shields.io/npm/l/@lacspace/webauthn?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Everything for passwordless / biometric auth in one small package: **browser ceremony helpers**, **server challenge & options builders**, and **real assertion verification** (ES256/RS256) over Web Crypto — including the fiddly ES256 DER→P1363 conversion and a compact CBOR/COSE parser that extracts the public key at registration.

- 👆 Browser: `startRegistration` / `startAuthentication`, `isPlatformAuthenticatorAvailable`
- 🖥️ Server: `generateChallenge`, `generateRegistrationOptions`, `generateAuthenticationOptions`
- ✅ Server verify: `verifyRegistration` (extracts the public key), `verifyAuthentication` (signature + rpId + origin + challenge + counter)
- ⚡ Zero dependencies · 🌍 isomorphic (Web Crypto) · fully typed

> **Scope:** performs origin / rpId / challenge / signature / sign-counter checks — the checks that matter for nearly every app — with **`"none"` attestation**. It does not verify the attestation-statement trust chain (device provenance); if you need enterprise attestation, pair it with a specialist verifier.

## Install

```bash
npm install @lacspace/webauthn
```

## Register a passkey

```ts
// --- server: create options ---
import { generateRegistrationOptions, generateChallenge } from "@lacspace/webauthn";
const challenge = generateChallenge();               // store in the session
const options = generateRegistrationOptions({ rpName: "Lacspace", rpID: "lacspace.com", userID, userName, challenge });

// --- browser ---
import { startRegistration } from "@lacspace/webauthn";
const response = await startRegistration(options);   // FaceID / fingerprint prompt → JSON

// --- server: verify + store ---
import { verifyRegistration } from "@lacspace/webauthn";
const { credentialId, publicKey, algorithm, counter } = await verifyRegistration({
  attestationObject: response.attestationObject,
  clientDataJSON: response.clientDataJSON,
  expectedChallenge: challenge, expectedOrigin: "https://lacspace.com", expectedRPID: "lacspace.com",
});
// store { credentialId, publicKey (JWK), algorithm, counter } against the user
```

## Sign in with a passkey

```ts
// --- server ---
import { generateAuthenticationOptions } from "@lacspace/webauthn";
const challenge = generateChallenge();
const options = generateAuthenticationOptions({ rpID: "lacspace.com", allowCredentials: [credentialId], challenge });

// --- browser ---
import { startAuthentication } from "@lacspace/webauthn";
const response = await startAuthentication(options);

// --- server: verify ---
import { verifyAuthentication } from "@lacspace/webauthn";
const { verified, newCounter } = await verifyAuthentication({
  authenticatorData: response.authenticatorData,
  clientDataJSON: response.clientDataJSON,
  signature: response.signature,
  publicKey, algorithm, counter,                       // from storage
  expectedChallenge: challenge, expectedOrigin: "https://lacspace.com", expectedRPID: "lacspace.com",
});
if (verified) { /* update stored counter = newCounter, log the user in */ }
```

## API

| Export | Where | Description |
| --- | --- | --- |
| `isWebAuthnSupported` / `isPlatformAuthenticatorAvailable` | browser | feature detection |
| `startRegistration` / `startAuthentication` | browser | run the ceremony |
| `generateChallenge` | server | random challenge |
| `generateRegistrationOptions` / `generateAuthenticationOptions` | server | build options JSON |
| `verifyRegistration` / `verifyAuthentication` | server | verify + extract key |

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| **`@lacspace/webauthn`** | Passkeys / biometric (this package) |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
