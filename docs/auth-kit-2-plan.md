# Auth Kit 2 — plan (social login + sessions)

Two zero-dependency-by-default, isomorphic packages that close the last gap in
the Security Kit: signing users in with a third-party identity provider and
keeping them signed in. Everything is built from the RFCs, verified against the
providers' own live discovery documents, and exercised end-to-end against an
in-process mock OpenID provider whose keys are generated per test run.

| package | standards | independent cross-check | known answers |
|---|---|---|---|
| `@lacspace/oauth` | OAuth 2.0 (RFC 6749), OAuth 2.1 draft (PKCE always, no implicit), PKCE (RFC 7636), OIDC Core 1.0 + Discovery 1.0, RFC 9207 `iss` check, RFC 7009 revocation, RFC 6750 bearer | every preset is asserted against the provider's live `/.well-known/openid-configuration` in `live.test.ts`; ID tokens verified through `@lacspace/jwt` JWKS-by-kid | RFC 7636 Appendix B PKCE vector; OIDC Core §3.1.3.7 validation steps as individual hostile tests |
| `@lacspace/session` | HTTP cookies (RFC 6265bis: SameSite, `__Host-` prefix), AES-256-GCM + HKDF (RFC 5869) over Web Crypto, HMAC-SHA256 signed mode, double-submit CSRF | tampered / truncated / foreign-key / expired / oversized cookies all rejected with a typed reason; key rotation with `secrets: [new, old]` | cookie round-trips byte-exact; Web Crypto known-answer for HKDF |

## `@lacspace/oauth`

```ts
import { createOAuthClient, google, github, oidc } from "@lacspace/oauth";

const client = createOAuthClient(google({ clientId, clientSecret, redirectUri }));

// 1. redirect
const { url, state, codeVerifier, nonce } = await client.authorizationUrl({ scope: ["openid", "email", "profile"] });
// 2. callback
const tokens = await client.handleCallback(callbackUrl, { state, codeVerifier, nonce });
const profile = await client.userInfo(tokens);      // normalised { id, email, emailVerified, name, picture, username, raw }
const claims  = tokens.idTokenClaims;               // verified (signature via JWKS, iss, aud, azp, exp, iat, nonce, at_hash)
// 3. later
await client.refresh(tokens.refreshToken);
await client.revoke(tokens.accessToken);
```

- **Presets**: google, github, microsoft (tenant-aware issuer), apple (ES256
  client-secret JWT helper, profile from the ID token), gitlab, discord, slack,
  linkedin, facebook, x, spotify, twitch, notion, plus `oidc({ issuer })` for
  Auth0 / Okta / Keycloak / Cognito / Zitadel / anything with discovery, and
  `oauth2({...endpoints})` for the rest.
- **Security defaults**: PKCE S256 whenever the provider supports it, `state`
  always, `nonce` for OIDC, `iss` callback parameter checked when present,
  `alg: none` rejected, token endpoint auth `client_secret_post` /
  `client_secret_basic` / `none` (public clients), clock skew 60 s.
- **Injectable**: `fetch`, `random`, `now` — the test suite runs with no network.
- **Errors**: one `OAuthError` with `code` ∈ state_mismatch, provider_error,
  token_request_failed, id_token_invalid, nonce_mismatch, discovery_failed,
  userinfo_failed, unsupported.
- Depends only on `@lacspace/jwt` (JWKS, ES256 signing for Apple).

## `@lacspace/session`

```ts
import { createCookieSession, createCsrf } from "@lacspace/session";

const sessions = createCookieSession<{ userId: string }>({ secrets: [process.env.SESSION_SECRET!], cookie: { name: "__Host-sid", maxAge: 60 * 60 * 24 * 7 } });

const { data, expiresAt } = await sessions.read(request.headers.get("cookie"));
const setCookie = await sessions.commit({ userId });   // Set-Cookie header value
const clear = sessions.destroy();
```

- Encrypted (AES-256-GCM, key derived per secret with HKDF) by default;
  `mode: "signed"` for readable-but-tamper-proof.
- Rotation: first secret writes, every secret is tried on read; a short key id
  in the cookie picks the right one without trial decrypts.
- `rolling: true` re-issues once past half the lifetime; `absoluteMaxAge` caps it.
- 4096-byte guard, `__Host-` prefix rules enforced (Secure, Path=/, no Domain).
- `createOAuthStateStore()` — 10-minute cookie for `{ state, codeVerifier, nonce, returnTo }`, the thing every OAuth callback needs.
- `createCsrf()` — signed double-submit tokens bound to the session id.
- Helpers: `parseCookies`, `serializeCookie`, `flash()`.

## Verification ladder

1. Unit: PKCE vector, URL building, cookie serialisation, HKDF known answer.
2. Mock provider (in-process, keys generated with `@lacspace/jwt`): full code
   flow, refresh, revoke, userinfo, every OIDC validation step made to fail
   one at a time (wrong iss / aud / azp / nonce / exp / alg / kid / signature).
3. Live (`LIVE=1`): each preset's endpoints equal the provider's discovery
   document today.
4. Clean registry install with `npm audit signatures` after CI publish.
