import { createRemoteJWKS, decode, verify as verifyJwt, type Algorithm, type KeyResolver } from "@lacspace/jwt";
import { discover } from "./discovery.js";
import { OAuthError } from "./errors.js";
import type {
  AuthorizationUrl,
  AuthorizationUrlOptions,
  CallbackExpectations,
  CallbackParams,
  ClientOptions,
  ExchangeOptions,
  IdTokenClaims,
  Profile,
  ProviderConfig,
  Tokens,
} from "./types.js";
import { accessTokenHash, base64, codeChallengeS256, constantTimeEqual, defaultFetch, form, generateCodeVerifier, generateNonce, generateState, randomBytes, scopesToString, type FetchLike } from "./util.js";

const ASYM: Algorithm[] = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"];
const SYM: Algorithm[] = ["HS256", "HS384", "HS512"];

export interface OAuthClient {
  readonly config: ProviderConfig;
  /** Resolve discovery (if configured) and return the effective config. */
  resolve(): Promise<ProviderConfig>;
  /** Build the redirect URL. Store `state`, `codeVerifier` and `nonce` (e.g. with `@lacspace/session`'s OAuth state store). */
  authorizationUrl(opts?: AuthorizationUrlOptions): Promise<AuthorizationUrl>;
  /** Parse the callback query (URL, query string, URLSearchParams, FormData or a plain object — Apple posts a form). */
  parseCallback(input: string | URL | URLSearchParams | FormData | Record<string, unknown>): CallbackParams;
  /** Validate state / error / iss, then exchange the code. */
  handleCallback(input: string | URL | URLSearchParams | FormData | Record<string, unknown>, expected: CallbackExpectations): Promise<Tokens>;
  /** Exchange an authorization code (PKCE verifier + nonce checked when given). */
  exchangeCode(opts: ExchangeOptions): Promise<Tokens>;
  /** Verify an ID token: signature (JWKS by kid), iss, aud, azp, exp/iat, nonce, at_hash. */
  verifyIdToken(idToken: string, opts?: { nonce?: string; accessToken?: string }): Promise<IdTokenClaims>;
  /** Refresh with a refresh token. */
  refresh(refreshToken: string, opts?: { scope?: string | string[]; params?: Record<string, string> }): Promise<Tokens>;
  /** RFC 7009 revocation. */
  revoke(token: string, opts?: { tokenTypeHint?: "access_token" | "refresh_token" }): Promise<void>;
  /** RFC 6749 §4.4 client credentials (machine-to-machine). */
  clientCredentials(opts?: { scope?: string | string[]; params?: Record<string, string> }): Promise<Tokens>;
  /** Fetch + normalise the user's profile (userinfo endpoint, or the ID token / token response when the provider has none). */
  userInfo(tokens: Tokens | string): Promise<Profile>;
}

function pick<T>(v: T | undefined, d: T): T {
  return v === undefined ? d : v;
}

/** Default OIDC standard-claims → Profile mapping. */
export function oidcProfile(raw: Record<string, unknown>): Profile {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const ev = raw["email_verified"];
  const p: Profile = { id: String(raw["sub"] ?? raw["id"] ?? ""), raw };
  if (s("email")) p.email = s("email");
  if (ev !== undefined) p.emailVerified = ev === true || ev === "true";
  if (s("name")) p.name = s("name");
  if (s("given_name")) p.givenName = s("given_name");
  if (s("family_name")) p.familyName = s("family_name");
  if (s("preferred_username")) p.username = s("preferred_username");
  if (s("picture")) p.picture = s("picture");
  if (s("locale")) p.locale = s("locale");
  return p;
}

export function createOAuthClient(config: ProviderConfig, options: ClientOptions = {}): OAuthClient {
  const fetchImpl: FetchLike = options.fetch ?? defaultFetch();
  const random = options.random ?? randomBytes;
  const now = options.now ?? (() => Date.now());
  const skew = pick(options.clockTolerance, 60);
  let resolved: Promise<ProviderConfig> | null = null;
  let jwks: KeyResolver | null = null;

  async function resolve(): Promise<ProviderConfig> {
    if (!config.discover) return config;
    if (!resolved)
      resolved = (async () => {
        const doc = await discover(config.discover!, { fetch: fetchImpl });
        const out: ProviderConfig = {
          ...config,
          authorizationEndpoint: config.authorizationEndpoint || doc.authorization_endpoint,
          tokenEndpoint: config.tokenEndpoint || doc.token_endpoint || "",
          issuer: config.issuer ?? doc.issuer,
        };
        if (!out.userinfoEndpoint && doc.userinfo_endpoint) out.userinfoEndpoint = doc.userinfo_endpoint;
        if (!out.jwksUri && doc.jwks_uri) out.jwksUri = doc.jwks_uri;
        if (!out.revocationEndpoint && doc.revocation_endpoint) out.revocationEndpoint = doc.revocation_endpoint;
        if (out.pkce === undefined && Array.isArray(doc.code_challenge_methods_supported)) out.pkce = doc.code_challenge_methods_supported.includes("S256");
        if (!out.tokenEndpoint) throw new OAuthError("discovery document has no token_endpoint", "discovery_failed");
        return out;
      })();
    return resolved;
  }

  function tokenAuth(c: ProviderConfig): { headers: Record<string, string>; fields: Record<string, string | undefined> } {
    const mode = c.tokenEndpointAuth ?? (c.clientSecret ? "client_secret_post" : "none");
    if (mode === "client_secret_basic") {
      if (!c.clientSecret) throw new OAuthError("client_secret_basic needs a clientSecret", "unsupported");
      return { headers: { authorization: `Basic ${base64(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`)}` }, fields: {} };
    }
    if (mode === "client_secret_post") {
      if (!c.clientSecret) throw new OAuthError("client_secret_post needs a clientSecret", "unsupported");
      return { headers: {}, fields: { client_id: c.clientId, client_secret: c.clientSecret } };
    }
    return { headers: {}, fields: { client_id: c.clientId } };
  }

  async function tokenRequest(c: ProviderConfig, fields: Record<string, string | undefined>, endpoint = c.tokenEndpoint): Promise<Record<string, unknown>> {
    const auth = tokenAuth(c);
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...auth.headers },
        body: form({ ...auth.fields, ...fields }),
      });
    } catch (cause) {
      throw new OAuthError(`${c.id}: token request failed`, "token_request_failed", { cause });
    }
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // A few legacy endpoints answer form-encoded (GitHub without Accept, Facebook old versions).
      body = Object.fromEntries(new URLSearchParams(text));
    }
    if (!res.ok || typeof body["error"] === "string") {
      const err = typeof body["error"] === "string" ? body["error"] : undefined;
      const desc = typeof body["error_description"] === "string" ? body["error_description"] : undefined;
      throw new OAuthError(`${c.id}: token endpoint returned ${res.status}${err ? ` (${err}${desc ? `: ${desc}` : ""})` : ""}`, "token_request_failed", {
        status: res.status,
        providerError: err,
        description: desc,
      });
    }
    return body;
  }

  async function toTokens(c: ProviderConfig, body: Record<string, unknown>, nonce?: string): Promise<Tokens> {
    const accessToken = body["access_token"];
    if (typeof accessToken !== "string" || !accessToken) throw new OAuthError(`${c.id}: token response has no access_token`, "token_request_failed");
    const t: Tokens = { accessToken, tokenType: typeof body["token_type"] === "string" ? body["token_type"] : "Bearer", raw: body };
    if (typeof body["refresh_token"] === "string") t.refreshToken = body["refresh_token"];
    if (typeof body["scope"] === "string") t.scope = body["scope"];
    const ttl = body["expires_in"];
    if (typeof ttl === "number" || (typeof ttl === "string" && /^\d+$/.test(ttl))) t.expiresAt = now() + Number(ttl) * 1000;
    if (typeof body["id_token"] === "string") {
      t.idToken = body["id_token"];
      t.idTokenClaims = await verifyIdToken(body["id_token"], { nonce, accessToken });
    }
    return t;
  }

  function issuerOk(c: ProviderConfig, iss: string, claims: IdTokenClaims): boolean {
    if (c.issuer === undefined) return true;
    if (typeof c.issuer === "function") return c.issuer(iss, claims);
    const expected = c.issuer.includes("{tenantid}") && typeof claims["tid"] === "string" ? c.issuer.replace("{tenantid}", claims["tid"]) : c.issuer;
    return iss === expected;
  }

  async function verifyIdToken(idToken: string, opts: { nonce?: string; accessToken?: string } = {}): Promise<IdTokenClaims> {
    const c = await resolve();
    let header: { alg?: string; kid?: string };
    try {
      header = decode(idToken).header as { alg?: string; kid?: string };
    } catch (cause) {
      throw new OAuthError(`${c.id}: ID token is malformed`, "id_token_invalid", { cause });
    }
    const alg = header.alg ?? "";
    const allowed = c.idTokenAlgorithms ?? [...ASYM, ...(c.clientSecret ? SYM : [])];
    if (!allowed.includes(alg)) throw new OAuthError(`${c.id}: ID token alg ${alg || "(none)"} is not allowed`, "id_token_invalid");
    let key: KeyResolver;
    if (alg.startsWith("HS")) {
      key = () => c.clientSecret!;
    } else {
      if (!c.jwksUri) throw new OAuthError(`${c.id}: no jwksUri configured — cannot verify ${alg} ID tokens`, "id_token_invalid");
      jwks ??= createRemoteJWKS(c.jwksUri, { fetch: fetchImpl as unknown as typeof fetch });
      key = jwks;
    }
    let claims: IdTokenClaims;
    try {
      claims = await verifyJwt<IdTokenClaims>(idToken, key, { algorithms: allowed as Algorithm[], clockTolerance: skew });
    } catch (cause) {
      throw new OAuthError(`${c.id}: ID token failed verification (${(cause as Error).message})`, "id_token_invalid", { cause });
    }
    if (typeof claims.iss !== "string" || !issuerOk(c, claims.iss, claims)) throw new OAuthError(`${c.id}: ID token issuer ${String(claims.iss)} is not trusted`, "id_token_invalid");
    if (typeof claims.sub !== "string" || !claims.sub) throw new OAuthError(`${c.id}: ID token has no sub`, "id_token_invalid");
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(c.clientId)) throw new OAuthError(`${c.id}: ID token audience does not include this client`, "id_token_invalid");
    if (aud.length > 1 && claims.azp !== c.clientId) throw new OAuthError(`${c.id}: ID token has multiple audiences but azp is not this client`, "id_token_invalid");
    if (typeof claims.exp !== "number" || typeof claims.iat !== "number") throw new OAuthError(`${c.id}: ID token lacks exp/iat`, "id_token_invalid");
    const t = Math.floor(now() / 1000);
    if (claims.exp + skew <= t) throw new OAuthError(`${c.id}: ID token has expired`, "id_token_invalid");
    if (claims.iat - skew > t) throw new OAuthError(`${c.id}: ID token issued in the future`, "id_token_invalid");
    if (options.maxTokenAge !== undefined && t - claims.iat > options.maxTokenAge + skew) throw new OAuthError(`${c.id}: ID token is too old`, "id_token_invalid");
    if (opts.nonce !== undefined) {
      if (typeof claims.nonce !== "string" || !constantTimeEqual(claims.nonce, opts.nonce)) throw new OAuthError(`${c.id}: ID token nonce mismatch`, "nonce_mismatch");
    }
    if (typeof claims.at_hash === "string" && opts.accessToken) {
      const expected = await accessTokenHash(opts.accessToken, alg);
      if (!constantTimeEqual(expected, claims.at_hash)) throw new OAuthError(`${c.id}: ID token at_hash does not match the access token`, "id_token_invalid");
    }
    return claims;
  }

  function parseCallback(input: string | URL | URLSearchParams | FormData | Record<string, unknown>): CallbackParams {
    let params: URLSearchParams;
    if (typeof input === "string") {
      const s = input.trim();
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
        const u = new URL(s);
        params = new URLSearchParams(u.search);
        if (!params.has("code") && !params.has("error") && u.hash.length > 1) params = new URLSearchParams(u.hash.slice(1));
      } else params = new URLSearchParams(s.replace(/^[?#]/, ""));
    } else if (input instanceof URL) {
      params = new URLSearchParams(input.search);
    } else if (input instanceof URLSearchParams) {
      params = input;
    } else if (typeof FormData !== "undefined" && input instanceof FormData) {
      params = new URLSearchParams();
      input.forEach((v, k) => {
        if (typeof v === "string") params.set(k, v);
      });
    } else {
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) if (typeof v === "string") params.set(k, v);
      else if (Array.isArray(v) && typeof v[0] === "string") params.set(k, v[0]);
    }
    const out: CallbackParams = {};
    params.forEach((v, k) => {
      if (k === "error_description") out.errorDescription = v;
      else if (k === "error_uri") out.errorUri = v;
      else out[k] = v;
    });
    return out;
  }

  async function exchangeCode(opts: ExchangeOptions): Promise<Tokens> {
    const c = await resolve();
    const body = await tokenRequest(c, {
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri ?? c.redirectUri,
      code_verifier: opts.codeVerifier,
      ...opts.params,
    });
    return toTokens(c, body, opts.nonce);
  }

  return {
    config,
    resolve,
    async authorizationUrl(opts = {}) {
      const c = await resolve();
      const state = opts.state ?? generateState(random);
      const usePkce = pick(c.pkce, true);
      const codeVerifier = usePkce ? opts.codeVerifier ?? generateCodeVerifier(random) : undefined;
      const scope = scopesToString(opts.scope ?? c.scopes, c.scopeSeparator ?? " ");
      const isOidc = scope?.split(/[\s,]/).includes("openid") ?? false;
      const nonce = isOidc ? opts.nonce ?? generateNonce(random) : opts.nonce;
      const u = new URL(c.authorizationEndpoint);
      const p = u.searchParams;
      p.set("response_type", "code");
      p.set("client_id", c.clientId);
      p.set("redirect_uri", opts.redirectUri ?? c.redirectUri);
      if (scope) p.set("scope", scope);
      p.set("state", state);
      if (nonce) p.set("nonce", nonce);
      if (codeVerifier) {
        p.set("code_challenge", await codeChallengeS256(codeVerifier));
        p.set("code_challenge_method", "S256");
      }
      if (opts.prompt) p.set("prompt", opts.prompt);
      if (opts.loginHint) p.set("login_hint", opts.loginHint);
      for (const [k, v] of Object.entries({ ...c.authorizationParams, ...opts.params })) p.set(k, v);
      const out: AuthorizationUrl = { url: u.toString(), state };
      if (codeVerifier) out.codeVerifier = codeVerifier;
      if (nonce) out.nonce = nonce;
      return out;
    },
    parseCallback,
    async handleCallback(input, expected) {
      const c = await resolve();
      const cb = parseCallback(input);
      if (!expected?.state) throw new OAuthError("handleCallback needs the stored state", "invalid_callback");
      if (!cb.state || !constantTimeEqual(cb.state, expected.state)) throw new OAuthError(`${c.id}: state mismatch — possible CSRF or an expired login`, "state_mismatch");
      if (cb.error) throw new OAuthError(`${c.id}: ${cb.error}${cb.errorDescription ? ` — ${cb.errorDescription}` : ""}`, "provider_error", { providerError: cb.error, description: cb.errorDescription });
      if (!cb.code) throw new OAuthError(`${c.id}: callback has no code`, "invalid_callback");
      if (cb.iss !== undefined && typeof c.issuer === "string" && !c.issuer.includes("{tenantid}") && cb.iss !== c.issuer)
        throw new OAuthError(`${c.id}: callback iss ${cb.iss} does not match the configured issuer (RFC 9207)`, "invalid_callback");
      if (pick(c.pkce, true) && !expected.codeVerifier) throw new OAuthError(`${c.id}: PKCE is enabled but no codeVerifier was stored`, "invalid_callback");
      const tokens = await exchangeCode({ code: cb.code, codeVerifier: expected.codeVerifier, nonce: expected.nonce, redirectUri: expected.redirectUri });
      if (cb.user) tokens.raw["user"] = cb.user;
      return tokens;
    },
    exchangeCode,
    verifyIdToken,
    async refresh(refreshToken, opts = {}) {
      const c = await resolve();
      const body = await tokenRequest(c, { grant_type: "refresh_token", refresh_token: refreshToken, scope: scopesToString(opts.scope, c.scopeSeparator ?? " "), ...opts.params });
      if (typeof body["refresh_token"] !== "string") body["refresh_token"] = refreshToken; // providers may omit it → keep the old one
      return toTokens(c, body);
    },
    async revoke(token, opts = {}) {
      const c = await resolve();
      if (!c.revocationEndpoint) throw new OAuthError(`${c.id}: provider has no revocation endpoint`, "unsupported");
      const auth = tokenAuth(c);
      let res;
      try {
        res = await fetchImpl(c.revocationEndpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...auth.headers },
          body: form({ ...auth.fields, token, token_type_hint: opts.tokenTypeHint }),
        });
      } catch (cause) {
        throw new OAuthError(`${c.id}: revocation request failed`, "revocation_failed", { cause });
      }
      if (!res.ok) throw new OAuthError(`${c.id}: revocation endpoint returned ${res.status}`, "revocation_failed", { status: res.status });
    },
    async clientCredentials(opts = {}) {
      const c = await resolve();
      if (!c.clientSecret) throw new OAuthError(`${c.id}: client credentials need a clientSecret`, "unsupported");
      const body = await tokenRequest(c, { grant_type: "client_credentials", scope: scopesToString(opts.scope, c.scopeSeparator ?? " "), ...opts.params });
      return toTokens(c, body);
    },
    async userInfo(input) {
      const c = await resolve();
      const tokens: Tokens = typeof input === "string" ? { accessToken: input, tokenType: "Bearer", raw: {} } : input;
      let raw: Record<string, unknown>;
      if (c.userinfoEndpoint) {
        let res;
        try {
          res = await fetchImpl(c.userinfoEndpoint, { headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json", ...c.userinfoHeaders } });
        } catch (cause) {
          throw new OAuthError(`${c.id}: userinfo request failed`, "userinfo_failed", { cause });
        }
        const text = await res.text();
        if (!res.ok) throw new OAuthError(`${c.id}: userinfo returned ${res.status}`, "userinfo_failed", { status: res.status, description: text.slice(0, 200) });
        try {
          raw = JSON.parse(text) as Record<string, unknown>;
        } catch (cause) {
          throw new OAuthError(`${c.id}: userinfo is not JSON`, "userinfo_failed", { cause });
        }
        // OIDC §5.3.2: when a userinfo `sub` exists it must match the ID token's.
        if (tokens.idTokenClaims && typeof raw["sub"] === "string" && raw["sub"] !== tokens.idTokenClaims.sub)
          throw new OAuthError(`${c.id}: userinfo sub does not match the ID token`, "userinfo_failed");
      } else if (tokens.idTokenClaims) {
        raw = { ...tokens.idTokenClaims };
      } else {
        raw = { ...tokens.raw };
      }
      const profile = await (c.profile ?? oidcProfile)(raw, { tokens, fetch: fetchImpl, config: c });
      if (!profile.id) throw new OAuthError(`${c.id}: could not determine a user id from the profile`, "userinfo_failed");
      profile.raw = { ...profile.raw, provider: c.id };
      return profile;
    },
  };
}
