import { describe, expect, it } from "vitest";
import { OAuthError, apple, auth0, cognito, codeChallengeS256, createOAuthClient, discord, discover, facebook, generateCodeVerifier, github, google, keycloak, microsoft, notion, oauth2, oidc, okta, providers, spotify, x } from "./index.js";
import { createMockProvider } from "./mock-provider.js";

const REDIRECT = "https://app.example.test/auth/callback";

async function setup(opts: Parameters<typeof createMockProvider>[0] = {}) {
  const op = await createMockProvider(opts);
  const client = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, clientSecret: op.clientSecret, redirectUri: REDIRECT }), { fetch: op.fetch, now: opts.now });
  return { op, client };
}

/** Simulate the provider's redirect back: take the authorize URL, mint a code bound to its PKCE challenge + nonce. */
function callbackFor(op: Awaited<ReturnType<typeof createMockProvider>>, url: string, extra: Record<string, string> = {}) {
  const u = new URL(url);
  const code = op.issueCode({ nonce: u.searchParams.get("nonce") ?? undefined, codeChallenge: u.searchParams.get("code_challenge") ?? undefined, redirectUri: u.searchParams.get("redirect_uri") ?? undefined });
  const cb = new URL(REDIRECT);
  cb.searchParams.set("code", code);
  cb.searchParams.set("state", u.searchParams.get("state")!);
  for (const [k, v] of Object.entries(extra)) cb.searchParams.set(k, v);
  return cb.toString();
}

describe("PKCE (RFC 7636 Appendix B)", () => {
  it("matches the published vector", async () => {
    expect(await codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("verifier is 43 unreserved chars", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("authorization URL", () => {
  it("builds an OIDC + PKCE redirect with state and nonce", async () => {
    const { client } = await setup();
    const a = await client.authorizationUrl({ prompt: "select_account", loginHint: "ada@example.test", params: { access_type: "offline" } });
    const u = new URL(a.url);
    expect(u.origin + u.pathname).toBe("https://op.example.test/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("client-123");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("scope")).toBe("openid profile email");
    expect(u.searchParams.get("state")).toBe(a.state);
    expect(u.searchParams.get("nonce")).toBe(a.nonce);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(await codeChallengeS256(a.codeVerifier!));
    expect(u.searchParams.get("prompt")).toBe("select_account");
    expect(u.searchParams.get("login_hint")).toBe("ada@example.test");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it("no nonce without openid, no PKCE when disabled, scopes deduped", async () => {
    const c = createOAuthClient(oauth2({ clientId: "c", redirectUri: REDIRECT, authorizationEndpoint: "https://x.test/a", tokenEndpoint: "https://x.test/t" }, { pkce: false }), { fetch: async () => { throw new Error("no network"); } });
    const a = await c.authorizationUrl({ scope: "read read write" });
    const u = new URL(a.url);
    expect(a.nonce).toBeUndefined();
    expect(a.codeVerifier).toBeUndefined();
    expect(u.searchParams.has("code_challenge")).toBe(false);
    expect(u.searchParams.get("scope")).toBe("read write");
  });
});

describe("full authorization-code flow against a mock OP", () => {
  it("handleCallback → verified tokens → userinfo profile", async () => {
    const { op, client } = await setup();
    const a = await client.authorizationUrl();
    const tokens = await client.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce });
    expect(tokens.accessToken).toBe("at-2");
    expect(tokens.refreshToken).toBe("rt-2");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    expect(tokens.idTokenClaims?.sub).toBe("user-42");
    expect(tokens.idTokenClaims?.nonce).toBe(a.nonce);
    const profile = await client.userInfo(tokens);
    expect(profile).toMatchObject({ id: "user-42", email: "ada@example.test", emailVerified: true, name: "Ada Lovelace", username: "ada", picture: "https://img.example.test/ada.png" });
    expect(profile.raw["provider"]).toBe("oidc");
    // the token request carried PKCE + client_secret_post
    const tok = op.calls.find((c) => c.url.endsWith("/token"))!;
    const body = new URLSearchParams(tok.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe(a.codeVerifier);
    expect(body.get("client_secret")).toBe(op.clientSecret);
    expect(tok.headers["accept"]).toBe("application/json");
    // discovery was fetched exactly once and JWKS once
    expect(op.calls.filter((c) => c.url.includes("openid-configuration")).length).toBe(1);
    expect(op.calls.filter((c) => c.url.endsWith("/jwks")).length).toBe(1);
  });
  it("refresh, revoke and client credentials", async () => {
    const { op, client } = await setup();
    const a = await client.authorizationUrl();
    const t = await client.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce });
    const r = await client.refresh(t.refreshToken!);
    expect(r.accessToken).not.toBe(t.accessToken);
    expect(r.refreshToken).toBe(t.refreshToken); // kept when the provider omits it
    expect(r.idTokenClaims?.sub).toBe("user-42");
    await client.revoke(t.accessToken, { tokenTypeHint: "access_token" });
    expect(op.revoked).toEqual([t.accessToken]);
    const cc = await client.clientCredentials({ scope: ["api:read", "api:write"] });
    expect(cc.scope).toBe("api:read api:write");
    expect(cc.idToken).toBeUndefined();
  });
  it("client_secret_basic and public (none) clients", async () => {
    const op = await createMockProvider();
    const basic = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, clientSecret: op.clientSecret, redirectUri: REDIRECT }, { tokenEndpointAuth: "client_secret_basic" }), { fetch: op.fetch });
    const a = await basic.authorizationUrl();
    await basic.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce });
    const call = op.calls.find((c) => c.url.endsWith("/token"))!;
    expect(call.headers["authorization"]).toMatch(/^Basic /);
    expect(new URLSearchParams(call.body).has("client_secret")).toBe(false);
    const pub = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, redirectUri: REDIRECT }), { fetch: op.fetch });
    const b = await pub.authorizationUrl();
    const t = await pub.handleCallback(callbackFor(op, b.url), { state: b.state, codeVerifier: b.codeVerifier, nonce: b.nonce });
    expect(t.idTokenClaims?.sub).toBe("user-42");
    await expect(pub.clientCredentials()).rejects.toMatchObject({ code: "unsupported" });
  });
  it("parses callbacks from URL, query string, URLSearchParams, FormData and objects (Apple form_post)", async () => {
    const { client } = await setup();
    expect(client.parseCallback("https://app/cb?code=c&state=s&error_description=x%20y")).toEqual({ code: "c", state: "s", errorDescription: "x y" });
    expect(client.parseCallback("?code=c&state=s")).toEqual({ code: "c", state: "s" });
    expect(client.parseCallback("code=c&state=s")).toEqual({ code: "c", state: "s" });
    expect(client.parseCallback(new URLSearchParams("code=c"))).toEqual({ code: "c" });
    const fd = new FormData();
    fd.set("code", "c");
    fd.set("user", '{"name":{"firstName":"Ada"}}');
    expect(client.parseCallback(fd)).toEqual({ code: "c", user: '{"name":{"firstName":"Ada"}}' });
    expect(client.parseCallback({ code: "c", state: ["s"] })).toEqual({ code: "c", state: "s" });
    expect(client.parseCallback("https://app/cb#code=c&state=s")).toEqual({ code: "c", state: "s" });
  });
});

describe("hostile callbacks and tokens", () => {
  it("state mismatch / missing state / provider error / missing code / iss mismatch", async () => {
    const { op, client } = await setup();
    const a = await client.authorizationUrl();
    const cb = callbackFor(op, a.url);
    await expect(client.handleCallback(cb, { state: "other", codeVerifier: a.codeVerifier })).rejects.toMatchObject({ code: "state_mismatch" });
    await expect(client.handleCallback(cb.replace(/&state=[^&]+/, ""), { state: a.state, codeVerifier: a.codeVerifier })).rejects.toMatchObject({ code: "state_mismatch" });
    await expect(client.handleCallback(`${REDIRECT}?error=access_denied&error_description=User+said+no&state=${a.state}`, { state: a.state, codeVerifier: a.codeVerifier })).rejects.toMatchObject({ code: "provider_error", providerError: "access_denied", description: "User said no" });
    await expect(client.handleCallback(`${REDIRECT}?state=${a.state}`, { state: a.state, codeVerifier: a.codeVerifier })).rejects.toMatchObject({ code: "invalid_callback" });
    await expect(client.handleCallback(`${cb}&iss=https://evil.test`, { state: a.state, codeVerifier: a.codeVerifier })).rejects.toMatchObject({ code: "invalid_callback" });
    await expect(client.handleCallback(cb, { state: a.state })).rejects.toMatchObject({ code: "invalid_callback" });
    await expect(client.handleCallback(cb, { state: "" } as never)).rejects.toMatchObject({ code: "invalid_callback" });
  });
  it("wrong PKCE verifier, reused code and token endpoint errors", async () => {
    const { op, client } = await setup();
    const a = await client.authorizationUrl();
    const cb = callbackFor(op, a.url);
    await expect(client.handleCallback(cb, { state: a.state, codeVerifier: generateCodeVerifier(), nonce: a.nonce })).rejects.toMatchObject({ code: "token_request_failed", providerError: "invalid_grant" });
    await expect(client.handleCallback(cb, { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce })).rejects.toMatchObject({ providerError: "invalid_grant", description: "unknown or used code" });
    op.tamper.tokenError = { status: 500, body: "<html>oops</html>" };
    const b = await client.authorizationUrl();
    await expect(client.handleCallback(callbackFor(op, b.url), { state: b.state, codeVerifier: b.codeVerifier, nonce: b.nonce })).rejects.toMatchObject({ code: "token_request_failed", status: 500 });
  });
  const cases: [string, (op: Awaited<ReturnType<typeof createMockProvider>>) => void, string][] = [
    ["wrong issuer", (op) => (op.tamper.iss = "https://evil.test"), "id_token_invalid"],
    ["wrong audience", (op) => (op.tamper.aud = "someone-else"), "id_token_invalid"],
    ["multiple audiences without azp", (op) => (op.tamper.aud = ["client-123", "other"]), "id_token_invalid"],
    ["wrong nonce", (op) => (op.tamper.nonce = "not-the-nonce"), "nonce_mismatch"],
    ["missing nonce", (op) => (op.tamper.nonce = null), "nonce_mismatch"],
    ["expired", (op) => (op.tamper.exp = Math.floor(Date.now() / 1000) - 120), "id_token_invalid"],
    ["issued in the future", (op) => (op.tamper.iat = Math.floor(Date.now() / 1000) + 600), "id_token_invalid"],
    ["unknown kid", (op) => (op.tamper.kid = "nope"), "id_token_invalid"],
    ["foreign key", (op) => (op.tamper.foreignKey = true), "id_token_invalid"],
    ["at_hash mismatch", (op) => (op.tamper.atHash = "AAAAAAAAAAAAAAAAAAAAAA"), "id_token_invalid"],
  ];
  for (const [name, arm, code] of cases) {
    it(`rejects an ID token with ${name}`, async () => {
      const { op, client } = await setup();
      const a = await client.authorizationUrl();
      const cb = callbackFor(op, a.url);
      arm(op);
      await expect(client.handleCallback(cb, { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce })).rejects.toMatchObject({ code });
    });
  }
  it("accepts multiple audiences when azp is us, tolerates skew, and honours maxTokenAge", async () => {
    const { op, client } = await setup();
    op.tamper.aud = ["client-123", "other"];
    op.tamper.azp = "client-123";
    op.tamper.iat = Math.floor(Date.now() / 1000) + 30; // 30 s in the future < 60 s skew
    const a = await client.authorizationUrl();
    const t = await client.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce });
    expect(t.idTokenClaims?.azp).toBe("client-123");
    const strict = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, clientSecret: op.clientSecret, redirectUri: REDIRECT }), { fetch: op.fetch, maxTokenAge: 10, clockTolerance: 0 });
    op.tamper.iat = Math.floor(Date.now() / 1000) - 60;
    const b = await strict.authorizationUrl();
    await expect(strict.handleCallback(callbackFor(op, b.url), { state: b.state, codeVerifier: b.codeVerifier, nonce: b.nonce })).rejects.toThrow(/too old/);
  });
  it("rejects alg=none and HS256 unless a secret is configured; accepts HS256 with a secret", async () => {
    const op = await createMockProvider();
    const pub = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, redirectUri: REDIRECT }), { fetch: op.fetch });
    op.tamper.alg = "HS256";
    const a = await pub.authorizationUrl();
    await expect(pub.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce })).rejects.toThrow(/alg HS256 is not allowed/);
    const conf = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, clientSecret: op.clientSecret, redirectUri: REDIRECT }), { fetch: op.fetch });
    const b = await conf.authorizationUrl();
    const t = await conf.handleCallback(callbackFor(op, b.url), { state: b.state, codeVerifier: b.codeVerifier, nonce: b.nonce });
    expect(t.idTokenClaims?.sub).toBe("user-42");
    // alg none: hand-craft
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"x"}').toString("base64url")}.`;
    await expect(conf.verifyIdToken(none)).rejects.toMatchObject({ code: "id_token_invalid" });
    await expect(conf.verifyIdToken("garbage")).rejects.toMatchObject({ code: "id_token_invalid" });
  });
  it("userinfo sub must match the ID token; 401s surface as userinfo_failed", async () => {
    const { op, client } = await setup();
    const a = await client.authorizationUrl();
    const t = await client.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce });
    op.tamper.userinfoSub = "someone-else";
    await expect(client.userInfo(t)).rejects.toMatchObject({ code: "userinfo_failed" });
    await expect(client.userInfo("bogus-token")).rejects.toMatchObject({ code: "userinfo_failed", status: 401 });
  });
  it("Microsoft-style {tenantid} issuer template", async () => {
    const op = await createMockProvider({ issuer: "https://login.microsoftonline.com/tenant-abc/v2.0" });
    const c = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, clientSecret: op.clientSecret, redirectUri: REDIRECT }, { issuer: "https://login.microsoftonline.com/{tenantid}/v2.0" }), { fetch: op.fetch });
    const a = await c.authorizationUrl();
    const t = await c.handleCallback(callbackFor(op, a.url), { state: a.state, codeVerifier: a.codeVerifier, nonce: a.nonce });
    expect(t.idTokenClaims?.["tid"]).toBe("tenant-abc");
    const bad = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, clientSecret: op.clientSecret, redirectUri: REDIRECT }, { issuer: "https://login.microsoftonline.com/other-tenant/v2.0" }), { fetch: op.fetch });
    const b = await bad.authorizationUrl();
    await expect(bad.handleCallback(callbackFor(op, b.url), { state: b.state, codeVerifier: b.codeVerifier, nonce: b.nonce })).rejects.toMatchObject({ code: "id_token_invalid" });
  });
});

describe("discovery", () => {
  it("fetches and validates the document; rejects issuer mismatch and junk", async () => {
    const op = await createMockProvider();
    const d = await discover(op.issuer, { fetch: op.fetch });
    expect(d.token_endpoint).toBe("https://op.example.test/token");
    op.discovery["issuer"] = "https://other.test";
    await expect(discover(op.issuer, { fetch: op.fetch })).rejects.toMatchObject({ code: "discovery_failed" });
    await expect(discover("https://nowhere.test", { fetch: op.fetch })).rejects.toMatchObject({ code: "discovery_failed" });
    await expect(discover("https://x.test", { fetch: async () => ({ ok: true, status: 200, text: async () => "nope" }) })).rejects.toMatchObject({ code: "discovery_failed" });
  });
  it("oidc() resolves endpoints lazily and pkce from the document", async () => {
    const op = await createMockProvider();
    const c = createOAuthClient(oidc({ issuer: op.issuer, clientId: op.clientId, redirectUri: REDIRECT }), { fetch: op.fetch });
    const r = await c.resolve();
    expect(r).toMatchObject({ authorizationEndpoint: `${op.issuer}/authorize`, tokenEndpoint: `${op.issuer}/token`, jwksUri: `${op.issuer}/jwks`, issuer: op.issuer, pkce: true });
  });
});

describe("presets", () => {
  const creds = { clientId: "id", clientSecret: "sec", redirectUri: REDIRECT };
  it("have the documented endpoints", () => {
    expect(google(creds)).toMatchObject({ id: "google", authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth", tokenEndpoint: "https://oauth2.googleapis.com/token", jwksUri: "https://www.googleapis.com/oauth2/v3/certs", pkce: true });
    expect(github(creds)).toMatchObject({ tokenEndpoint: "https://github.com/login/oauth/access_token", pkce: false });
    expect(github(creds, { enterpriseUrl: "https://ghe.corp" }).userinfoEndpoint).toBe("https://ghe.corp/api/v3/user");
    expect(microsoft(creds)).toMatchObject({ issuer: "https://login.microsoftonline.com/{tenantid}/v2.0" });
    expect(microsoft(creds, { tenant: "abc" })).toMatchObject({ issuer: "https://login.microsoftonline.com/abc/v2.0", tokenEndpoint: "https://login.microsoftonline.com/abc/oauth2/v2.0/token" });
    expect(apple(creds).authorizationParams).toEqual({ response_mode: "form_post" });
    expect(x(creds).tokenEndpointAuth).toBe("client_secret_basic");
    expect(x({ clientId: "id", redirectUri: REDIRECT }).tokenEndpointAuth).toBe("none");
    expect(spotify(creds).tokenEndpointAuth).toBe("client_secret_basic");
    expect(notion(creds).authorizationParams).toEqual({ owner: "user" });
    expect(discord(creds).scopes).toEqual(["identify", "email"]);
    expect(facebook(creds, { version: "v20.0" }).tokenEndpoint).toBe("https://graph.facebook.com/v20.0/oauth/access_token");
    expect(auth0({ ...creds, domain: "acme.eu.auth0.com" }).discover).toBe("https://acme.eu.auth0.com/");
    expect(okta({ ...creds, domain: "acme.okta.com", authorizationServer: "default" }).discover).toBe("https://acme.okta.com/oauth2/default");
    expect(keycloak({ ...creds, baseUrl: "https://kc.acme.test/", realm: "main" }).discover).toBe("https://kc.acme.test/realms/main");
    expect(cognito({ ...creds, region: "ap-south-1", userPoolId: "ap-south-1_abc" }).discover).toBe("https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_abc");
    expect(Object.keys(providers)).toHaveLength(17);
    const g = google({ clientId: "id", redirectUri: REDIRECT });
    expect("clientSecret" in g).toBe(false);
  });
  it("google issuer accepts both spellings", () => {
    const iss = google(creds).issuer as (i: string, c: never) => boolean;
    expect(iss("accounts.google.com", {} as never)).toBe(true);
    expect(iss("https://accounts.google.com", {} as never)).toBe(true);
    expect(iss("https://accounts.google.evil", {} as never)).toBe(false);
  });
  it("github profile falls back to /user/emails and sends a User-Agent", async () => {
    const calls: string[] = [];
    const f = async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url + "|" + (init?.headers?.["user-agent"] ?? ""));
      if (url.endsWith("/user")) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 99, login: "ada", name: "Ada", avatar_url: "https://a/p.png", email: null }) };
      if (url.endsWith("/user/emails")) return { ok: true, status: 200, text: async () => JSON.stringify([{ email: "old@x.test", primary: false, verified: true }, { email: "ada@x.test", primary: true, verified: true }]) };
      throw new Error("unexpected " + url);
    };
    const c = createOAuthClient(github(creds), { fetch: f });
    const p = await c.userInfo("tok");
    expect(p).toMatchObject({ id: "99", username: "ada", name: "Ada", email: "ada@x.test", emailVerified: true, picture: "https://a/p.png" });
    expect(calls[0]).toBe("https://api.github.com/user|lacspace-oauth");
  });
  it("apple profile merges the one-time `user` payload from the form post", async () => {
    const op = await createMockProvider({ issuer: "https://appleid.apple.com" });
    const c = createOAuthClient(apple({ ...creds, clientId: op.clientId, clientSecret: op.clientSecret }, { jwksUri: `${op.issuer}/jwks`, tokenEndpoint: `${op.issuer}/token` }), { fetch: op.fetch });
    const a = await c.authorizationUrl();
    expect(new URL(a.url).searchParams.get("response_mode")).toBe("form_post");
    expect(a.codeVerifier).toBeUndefined();
    const fd = new FormData();
    fd.set("code", op.issueCode({ nonce: a.nonce }));
    fd.set("state", a.state);
    fd.set("user", JSON.stringify({ name: { firstName: "Ada", lastName: "Lovelace" } }));
    const t = await c.handleCallback(fd, { state: a.state, nonce: a.nonce });
    const p = await c.userInfo(t);
    expect(p).toMatchObject({ id: "user-42", email: "ada@example.test", givenName: "Ada", familyName: "Lovelace" });
    expect((p.raw["user"] as { name: { firstName: string } }).name.firstName).toBe("Ada");
  });
  it("discord / x / facebook / spotify / notion normalisers", async () => {
    const d = await createOAuthClient(discord(creds), { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "1", username: "ada", global_name: "Ada", email: "a@x", verified: true, avatar: "abc" }) }) }).userInfo("t");
    expect(d).toMatchObject({ id: "1", username: "ada", name: "Ada", emailVerified: true, picture: "https://cdn.discordapp.com/avatars/1/abc.png" });
    const xx = await createOAuthClient(x(creds), { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: { id: "7", username: "ada", name: "Ada", profile_image_url: "https://p" } }) }) }).userInfo("t");
    expect(xx).toMatchObject({ id: "7", username: "ada", picture: "https://p" });
    const fb = await createOAuthClient(facebook(creds), { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "3", name: "Ada L", email: "a@x", picture: { data: { url: "https://pic" } } }) }) }).userInfo("t");
    expect(fb).toMatchObject({ id: "3", name: "Ada L", picture: "https://pic" });
    const sp = await createOAuthClient(spotify(creds), { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "s", display_name: "Ada", email: "a@x", images: [{ url: "https://i" }], country: "NP" }) }) }).userInfo("t");
    expect(sp).toMatchObject({ id: "s", name: "Ada", locale: "NP", picture: "https://i" });
    const n = createOAuthClient(notion(creds), { fetch: async () => { throw new Error("no"); } });
    const np = await n.userInfo({ accessToken: "t", tokenType: "bearer", raw: { owner: { user: { id: "u1", name: "Ada", avatar_url: "https://av", person: { email: "a@x" } } } } });
    expect(np).toMatchObject({ id: "u1", name: "Ada", email: "a@x", picture: "https://av" });
  });
  it("OAuthError carries code, provider error and cause", () => {
    const e = new OAuthError("m", "provider_error", { providerError: "access_denied", description: "d", status: 400, cause: new Error("c") });
    expect(e).toMatchObject({ name: "OAuthError", code: "provider_error", providerError: "access_denied", description: "d", status: 400 });
    expect((e as { cause?: Error }).cause?.message).toBe("c");
    expect(e instanceof Error).toBe(true);
  });
});
