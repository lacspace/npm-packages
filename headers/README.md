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

- 🛡️ `securityHeaders()` — sensible strict defaults
- 🧱 `csp()` / `strictCsp()` — typed Content-Security-Policy
- ▲ `toNextHeaders()` for `next.config` `headers()`
- ⚡ Zero dependencies · 🌍 isomorphic · fully typed

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
| `securityHeaders(opts?)` | headers object with strict defaults |
| `csp(directives)` | typed → CSP string |
| `strictCsp(overrides?)` | a strict baseline CSP |
| `toNextHeaders(opts?, source?)` | Next.js `headers()` array |

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

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
