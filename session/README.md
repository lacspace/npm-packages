# @lacspace/session

**Stateless sessions in an encrypted cookie — for any runtime.** AES-256-GCM over Web Crypto, keys stretched with HKDF, secret rotation, rolling and absolute expiry, `__Host-` cookie rules enforced, a 10-minute OAuth state store and double-submit CSRF tokens. Works with Web `Request`/`Response`, Node `http`, Next.js, Hono, Remix, Express, SvelteKit — anything with a Cookie header. Zero dependencies.

```bash
npm i @lacspace/session
```

## Use

```ts
import { createCookieSession } from "@lacspace/session";

const sessions = createCookieSession<{ userId: string; role: "admin" | "user" }>({
  secrets: [process.env.SESSION_SECRET!],   // ≥ 32 chars; prepend a new one to rotate
  maxAge: 60 * 60 * 24 * 7,                 // 7 days from the last commit (default)
  rolling: true,                            // re-issue once past half-life
  absoluteMaxAge: 60 * 60 * 24 * 30,        // …but never beyond 30 days from login
});

// read — from a Cookie header, a Web Request, or a Node IncomingMessage. Never throws.
const s = await sessions.read(request);
if (!s.data) return unauthorized(s.reason); // "missing" | "malformed" | "version" | "unknown_key" | "tampered" | "expired"
if (s.refreshedCookie) headers.append("set-cookie", s.refreshedCookie);

// write
headers.append("set-cookie", await sessions.commit({ userId: "u1", role: "user" }));

// logout
headers.append("set-cookie", sessions.destroy());
```

The cookie is `__Host-session=v1.<kid>.e.<aes-gcm>` by default: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain — the strongest profile browsers offer. Name and attributes are configurable (`cookie: { name, sameSite, domain, … }`); the `__Host-`/`__Secure-` rules are enforced, and a cookie over 4096 bytes throws instead of being silently dropped.

**Modes.** `mode: "encrypted"` (default) hides the payload. `mode: "signed"` keeps it readable (e.g. a `theme` cookie the client also reads) but tamper-proof (HMAC-SHA256).

**Rotation.** `secrets: [newSecret, oldSecret]` — the first writes, all verify. A short key id in the cookie picks the right secret without trial decrypts; drop the old secret once every session has rolled.

## OAuth state store

The thing every OAuth callback needs: remember `state`, the PKCE verifier and the nonce for ten minutes.

```ts
import { createOAuthStateStore } from "@lacspace/session";
const oauthState = createOAuthStateStore({ secrets: [SECRET] });         // cookie "__Host-oauth", 600 s
const setCookie = await oauthState.create({ state, codeVerifier, nonce, returnTo: "/app" });
const stored = await oauthState.read(request);                           // null when missing/expired/tampered
const clear = oauthState.clear();
```

Pairs with [`@lacspace/oauth`](https://developer.lacspace.com/packages/oauth).

## CSRF

Signed double-submit tokens bound to the session id — nothing stored server-side, and a token stolen from one session is useless in another.

```ts
import { createCsrf } from "@lacspace/session";
const csrf = createCsrf({ secrets: [SECRET] });
const token = await csrf.issue(s.id!);                                  // put in a hidden `_csrf` field or `x-csrf-token` header
const ok = await csrf.verify(csrf.tokenFrom(request, await request.formData()), s.id);
```

## Helpers

`parseCookies(header)`, `serializeCookie(name, value, opts)`, `clearCookie(name)`, `getCookie(request, name)`, `setFlash()` / `takeFlash()` for one-shot messages, `sessions.seal()` / `sessions.unseal()` for raw tokens outside a cookie.

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
