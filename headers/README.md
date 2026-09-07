<div align="center">

# @lacspace/headers

**Secure HTTP headers & a typed Content-Security-Policy builder.**

[![npm version](https://img.shields.io/npm/v/@lacspace/headers?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/headers)
[![install size](https://packagephobia.com/badge?p=@lacspace/headers)](https://packagephobia.com/result?p=@lacspace/headers)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/headers?label=minzip)](https://bundlephobia.com/package/@lacspace/headers)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/headers)
[![license](https://img.shields.io/npm/l/@lacspace/headers?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A tiny, framework-agnostic Helmet: strict security response headers (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, COOP) and a **typed CSP builder**. Get a plain headers object for Express/Hono/Fastify, or a Next.js `headers()` config.

- 🛡️ `securityHeaders()` — sensible strict defaults (+ COOP/COEP/CORP, Reporting-Endpoints, report-only)
- 🧱 `csp()` / `strictCsp()` — typed Content-Security-Policy
- 🔐 `strictPreset()` / `apiPreset()` — ready-made hardened header sets
- 🎫 `generateNonce()` / `cspHash()` + `withNonce()` / `withHashes()` — nonce & hash CSP
- 🧩 `parseCsp()` / `mergeCsp()` / `serializeCsp()` — structural CSP editing
- 🎛️ `permissionsPolicy()` — typed Permissions-Policy builder
- ▲ `toNextHeaders()` for `next.config` `headers()`
- ⚡ Zero dependencies · 🌍 isomorphic · fully typed

> **New in 1.2.0** — a typed `permissionsPolicy()` builder, COOP/COEP/CORP + Reporting-Endpoints/Report-To options, `Content-Security-Policy-Report-Only`, `cspHash()` + `withNonce()`/`withHashes()`, CSP `parseCsp`/`mergeCsp`/`serializeCsp`, and hardened `strictPreset()` / `apiPreset()`. All additive — every existing export is unchanged.

## Install

```bash
npm install @lacspace/headers
```

## Usage

```ts
import { securityHeaders, csp } from "@lacspace/headers";

const headers = securityHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.example.com"],
    imgSrc: ["'self'", "data:", "https:"],
    upgradeInsecureRequests: true,
  },
});
// { "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
//   "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN",
//   "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "…" }

// apply in any framework
for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
```

### Next.js

```ts
// next.config.js
import { toNextHeaders } from "@lacspace/headers";
export default { async headers() { return toNextHeaders({ contentSecurityPolicy: { defaultSrc: ["'self'"] } }); } };
```

## API

| Export | Description |
| --- | --- |
| `securityHeaders(opts?)` | headers object with strict defaults (CSP, HSTS, COOP/COEP/CORP, Permissions-Policy, reporting, report-only) |
| `csp(directives)` | typed → CSP string |
| `strictCsp(overrides?)` | a strict baseline CSP |
| `toNextHeaders(opts?, source?)` | Next.js `headers()` array |
| `strictPreset(opts?)` | hardened, cross-origin-isolated header set (`strict-dynamic`, HSTS preload, COOP/COEP/CORP) |
| `apiPreset(opts?)` | lean locked-down header set for JSON APIs |
| `permissionsPolicy(directives)` | typed → `Permissions-Policy` string |
| `generateNonce(bytes?)` | per-request CSP nonce (CSPRNG, base64) |
| `cspHash(source, algo?)` | `Promise<'sha256-…'>` hash of an inline script/style |
| `withNonce(policy, nonce, dirs?)` | inject a `'nonce-…'` into a CSP string |
| `withHashes(policy, hashes, dirs?)` | inject hash sources into a CSP string |
| `parseCsp(policy)` | CSP string → structured `CspPolicy` |
| `mergeCsp(a, b)` | union two policies per directive |
| `serializeCsp(policy)` | structured `CspPolicy` → CSP string |
| `reportingEndpoints(map)` | name→URL map → `Reporting-Endpoints` value |

### New in 1.2.0

```ts
import {
  permissionsPolicy, strictPreset, apiPreset,
  cspHash, withNonce, withHashes, generateNonce,
  parseCsp, mergeCsp, serializeCsp,
} from "@lacspace/headers";

// Typed Permissions-Policy
permissionsPolicy({ camera: false, geolocation: "self", microphone: ["self", "https://meet.example.com"] });
// => "camera=(), geolocation=(self), microphone=(self \"https://meet.example.com\")"

// Hardened, cross-origin-isolated preset (COOP/COEP/CORP + strict-dynamic + HSTS preload)
const nonce = generateNonce();
const headers = strictPreset({ nonce });          // ready-to-send header object
const api = apiPreset();                            // lean set for JSON endpoints

// CSP hash for an inline script, then inject nonce/hash into a policy
const hash = await cspHash("alert('Hello, world.');"); // 'sha256-…'
withHashes("script-src 'self'", [hash]);
withNonce("script-src 'self'", nonce);             // also seeds style-src

// Parse → merge → serialize an existing policy
serializeCsp(mergeCsp("script-src 'self'", "script-src https://cdn.example.com"));
// => "script-src 'self' https://cdn.example.com"

// Staged rollout + reporting
securityHeaders({
  contentSecurityPolicyReportOnly: { defaultSrc: ["'self'"], reportTo: ["default"] },
  reportingEndpoints: { default: "https://example.com/csp-reports" },
  crossOriginEmbedderPolicy: "require-corp",
  crossOriginResourcePolicy: "same-origin",
});
```

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| **`@lacspace/headers`** | Secure headers / CSP (this package) |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

## New in 1.1 — CSP nonces & adapters

```ts
import { generateNonce, strictCsp, applyHeaders, expressSecurityHeaders } from "@lacspace/headers";

// Per-request nonce → drop 'unsafe-inline', allow only your own inline scripts/styles
const nonce = generateNonce();
const policy = strictCsp({}, { nonce });      // adds 'nonce-…' to script-src & style-src
// …render <script nonce={nonce}> and set Content-Security-Policy: policy

// Fetch / edge — set all security headers on a Response
export function GET() { return applyHeaders(new Response("ok")); }

// Express
app.use(expressSecurityHeaders({ hstsPreload: true }));
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/headers` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/headers
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

