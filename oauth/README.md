# @lacspace/oauth

**Social login without a vendor SDK.** An OAuth 2.1 / OpenID Connect client with presets for Google, GitHub, Microsoft, Apple, GitLab, Discord, Slack, LinkedIn, Facebook, X, Spotify, Twitch and Notion, plus any OIDC issuer via discovery (Auth0, Okta, Keycloak, Cognito, Zitadel…). PKCE, `state` and `nonce` are on by default, ID tokens are verified against the provider's JWKS, and every profile comes back in one shape.

- **Secure by default** — PKCE S256, `state`, `nonce`, RFC 9207 `iss` check, `alg: none` rejected, `aud`/`azp`/`exp`/`iat`/`at_hash` validated, clock skew 60 s.
- **Isomorphic** — Web Crypto + `fetch`, so it runs on Node 20+, Bun, Deno, Cloudflare Workers, Vercel Edge and in Next.js route handlers.
- **Testable** — `fetch`, `random` and `now` are injectable; the test suite runs a full flow against an in-process OpenID provider, no network.
- **Tiny footprint** — the only dependency is `@lacspace/jwt` (JWKS-by-kid verification, ES256 for Apple's client secret).

```bash
npm i @lacspace/oauth @lacspace/session
```

## 30-second example (Next.js route handlers)

```ts
// lib/auth.ts
import { createOAuthClient, google } from "@lacspace/oauth";
import { createOAuthStateStore, createCookieSession } from "@lacspace/session";

export const client = createOAuthClient(
  google({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, redirectUri: "https://app.example.com/auth/google/callback" }),
);
export const oauthState = createOAuthStateStore({ secrets: [process.env.SESSION_SECRET!] });
export const sessions = createCookieSession<{ userId: string }>({ secrets: [process.env.SESSION_SECRET!] });
```

```ts
// app/auth/google/route.ts — start
export async function GET() {
  const { url, state, codeVerifier, nonce } = await client.authorizationUrl({ prompt: "select_account" });
  return new Response(null, { status: 302, headers: { location: url, "set-cookie": await oauthState.create({ state, codeVerifier, nonce, returnTo: "/app" }) } });
}
```

```ts
// app/auth/google/callback/route.ts — finish
export async function GET(req: Request) {
  const stored = await oauthState.read(req);
  if (!stored) return new Response("Login expired, try again", { status: 400 });
  const tokens = await client.handleCallback(req.url, stored);   // state ✓ PKCE ✓ nonce ✓ ID token ✓
  const profile = await client.userInfo(tokens);                 // { id, email, emailVerified, name, picture, … }
  const userId = await upsertUser(profile);                      // your DB
  const headers = new Headers({ location: stored.returnTo ?? "/" });
  headers.append("set-cookie", await sessions.commit({ userId }));
  headers.append("set-cookie", oauthState.clear());
  return new Response(null, { status: 302, headers });
}
```

## Providers

| Preset | Type | Notes |
| --- | --- | --- |
| `google(creds)` | OIDC + PKCE | add `params: { access_type: "offline", prompt: "consent" }` for a refresh token |
| `github(creds, { enterpriseUrl? })` | OAuth 2 | fills `email` from `/user/emails` (primary + verified) |
| `microsoft(creds, { tenant? })` | OIDC + PKCE | `"common"` (default) / `"organizations"` / `"consumers"` / tenant id — issuer checked per tenant |
| `apple(creds)` + `createAppleClientSecret({...})` | OIDC | `response_mode=form_post`; name arrives once in `profile.raw.user` |
| `gitlab(creds, { baseUrl? })` | OIDC + PKCE | self-hosted via `baseUrl` |
| `discord`, `x`, `spotify`, `facebook`, `notion` | OAuth 2 | normalised profiles; X and Spotify use `client_secret_basic` |
| `slack`, `linkedin`, `twitch` | OIDC | |
| `oidc({ issuer, ... })` | OIDC discovery | Auth0, Okta, Keycloak, Cognito, Zitadel, Authentik, Dex… (`auth0()`, `okta()`, `keycloak()`, `cognito()` are sugar) |
| `oauth2({ authorizationEndpoint, tokenEndpoint, ... })` | OAuth 2 | anything else |

Every preset takes `{ clientId, clientSecret?, redirectUri }` and an optional overrides object (scopes, `pkce`, `tokenEndpointAuth`, `authorizationParams`, `profile`, endpoints…). Omit `clientSecret` for a public (PKCE-only) client.

## API

```ts
const client = createOAuthClient(config, { fetch?, random?, now?, clockTolerance? = 60, maxTokenAge? });

await client.authorizationUrl({ scope?, state?, nonce?, codeVerifier?, prompt?, loginHint?, params?, redirectUri? })
// → { url, state, codeVerifier?, nonce? }   store the last three, redirect to url

client.parseCallback(urlOrQueryOrFormDataOrObject)   // → { code?, state?, error?, errorDescription?, iss?, user? }
await client.handleCallback(input, { state, codeVerifier?, nonce?, redirectUri? })   // → Tokens (throws OAuthError)
await client.exchangeCode({ code, codeVerifier?, nonce? })
await client.verifyIdToken(idToken, { nonce?, accessToken? })   // → IdTokenClaims
await client.userInfo(tokens | accessToken)                      // → Profile
await client.refresh(refreshToken)
await client.revoke(token, { tokenTypeHint? })
await client.clientCredentials({ scope? })                       // machine-to-machine
await client.resolve()                                           // effective config after discovery
```

```ts
interface Tokens  { accessToken; tokenType; refreshToken?; idToken?; idTokenClaims?; expiresAt?; scope?; raw }
interface Profile { id; email?; emailVerified?; name?; givenName?; familyName?; username?; picture?; locale?; raw }
class OAuthError extends Error { code: "state_mismatch" | "provider_error" | "token_request_failed" | "id_token_invalid" | "nonce_mismatch" | "discovery_failed" | "userinfo_failed" | "revocation_failed" | "unsupported" | "invalid_callback"; providerError?; description?; status? }
```

## What gets verified on an ID token

Signature via the provider's JWKS (cached, re-fetched on unknown `kid`) · `iss` (exact, per-tenant for Microsoft, or your predicate) · `aud` contains your client id · `azp` when there are several audiences · `exp` / `iat` with skew · `nonce` equals the one you stored · `at_hash` against the access token when present · algorithm allow-list (asymmetric only unless you set a client secret). All of it is exercised one failure at a time in the test suite against a real key pair.

## Sign in with Apple

```ts
const clientSecret = await createAppleClientSecret({ teamId, clientId, keyId, privateKey: p8Pem }); // cache ≤ 6 months
const client = createOAuthClient(apple({ clientId, clientSecret, redirectUri }));
// Apple POSTs the callback: pass the form body
const tokens = await client.handleCallback(await req.formData(), stored);
```

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
