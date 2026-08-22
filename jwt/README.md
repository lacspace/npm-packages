<div align="center">

# @lacspace/jwt

**JSON Web Tokens (HMAC) + secure random tokens — done safely.**

[![npm version](https://img.shields.io/npm/v/@lacspace/jwt?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/jwt)
[![install size](https://packagephobia.com/badge?p=@lacspace/jwt)](https://packagephobia.com/result?p=@lacspace/jwt)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/jwt?label=minzip)](https://bundlephobia.com/package/@lacspace/jwt)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/jwt)
[![license](https://img.shields.io/npm/l/@lacspace/jwt?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Sign and verify **HS256 / HS384 / HS512** JWTs over Web Crypto with strict expiry / not-before / issuer / audience checks and constant-time signature comparison. Isomorphic — runs on edge and workers where the `jsonwebtoken` package can't. Plus opaque and CSRF tokens.

- 🎟️ `sign` / `verify` / `decode` with typed claims
- ⏱️ `exp` / `nbf` / `iat`, `issuer`, `audience`, `clockTolerance`
- 🧯 Typed `JwtError` with a `code` (`expired`, `signature`, `audience`…)
- 🎲 `randomToken` / `csrfToken`
- ⚡ Zero deps (bar `@lacspace/crypto`) · 🌍 isomorphic · fully typed

## Install

```bash
npm install @lacspace/jwt
```

## Usage

```ts
import { sign, verify, JwtError } from "@lacspace/jwt";

const token = await sign({ sub: "user_1", role: "admin" }, process.env.JWT_SECRET!, {
  expiresIn: 3600,           // seconds
  issuer: "lacspace",
});

try {
  const payload = await verify(token, process.env.JWT_SECRET!, { issuer: "lacspace" });
  payload.sub;  // "user_1"
} catch (e) {
  if (e instanceof JwtError) console.log(e.code); // "expired" | "signature" | …
}
```

## Opaque & CSRF tokens

```ts
import { randomToken, csrfToken } from "@lacspace/jwt";

randomToken();   // 43-char URL-safe (32 bytes) — session ids, reset tokens
csrfToken();     // CSRF token
```

## API

| Export | Description |
| --- | --- |
| `sign(payload, secret, opts?)` | `algorithm`, `expiresIn`, `issuer`, `audience`, `subject` |
| `verify(token, secret, opts?)` | throws `JwtError`; checks sig + claims |
| `decode(token)` | header + payload, **no** verification |
| `randomToken(bytes?)` / `csrfToken()` | secure random tokens |

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| **`@lacspace/jwt`** | JWTs & tokens (this package) |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

## New in 1.1 — framework adapters & cookies

```ts
import { authenticate, extractBearer, toAuthCookie, clearAuthCookie, expressJwt } from "@lacspace/jwt";

// Verify straight from a Fetch Request / Next route / Node req (Bearer or cookie)
const payload = await authenticate(req, secret);                 // throws JwtError on failure
const payload2 = await authenticate(req, secret, { cookieName: "session" });

// Hardened auth cookie (HttpOnly + Secure + SameSite by default)
res.headers.set("Set-Cookie", toAuthCookie(token, { name: "session", maxAge: 3600 }));
res.headers.set("Set-Cookie", clearAuthCookie({ name: "session" })); // logout

// Express: verifies the token → req.user, else 401
app.use(expressJwt(secret));
```

## New in 1.2 — RS256/ES256, JWKS & refresh tokens

```ts
import { sign, verify, importPkcs8, importSpki, createRemoteJWKS, issueTokenPair, rotateRefreshToken } from "@lacspace/jwt";

// Asymmetric: sign with a private key, verify with the public key (clients can't forge)
const priv = await importPkcs8(PRIVATE_PEM, "ES256");
const token = await sign({ sub: "u1" }, priv, { algorithm: "ES256", keyId: "k1" });

// Consume 3rd-party OIDC tokens (Auth0/Cognito/Google) via cached JWKS
const jwks = createRemoteJWKS("https://issuer/.well-known/jwks.json");
const claims = await verify(idToken, jwks, { algorithms: ["RS256"] });

// Refresh-token flow with rotation + reuse detection
const { accessToken, refreshToken, refreshJti } = await issueTokenPair({ sub: "u1" }, secret);
const next = await rotateRefreshToken(refreshToken, secret, { isUsed: (jti) => store.has(jti) });
store.add(next.usedJti); // mark the old one spent
```

Plus `audience: string[]` matching and `importJwk()`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
