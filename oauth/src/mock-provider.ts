// Test-only: an in-process OpenID Provider with real keys. Not exported from the package.
import { exportJwk, generateKeyPair, sign, type Algorithm } from "@lacspace/jwt";
import { accessTokenHash, codeChallengeS256, type FetchLike } from "./util.js";

export interface MockTamper {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  nonce?: string | null;
  exp?: number;
  iat?: number;
  kid?: string;
  alg?: Algorithm;
  /** Sign with a different (unknown) key. */
  foreignKey?: boolean;
  atHash?: string | null;
  omitIdToken?: boolean;
  tokenError?: { status: number; body: unknown };
  userinfoSub?: string;
}

export interface MockProvider {
  issuer: string;
  clientId: string;
  clientSecret: string;
  fetch: FetchLike;
  calls: { url: string; method: string; headers: Record<string, string>; body?: string }[];
  /** Register a code the token endpoint will accept. */
  issueCode(opts: { nonce?: string; codeChallenge?: string; redirectUri?: string }): string;
  tamper: MockTamper;
  revoked: string[];
  discovery: Record<string, unknown>;
}

export async function createMockProvider(opts: { issuer?: string; alg?: Algorithm; clientId?: string; clientSecret?: string; now?: () => number } = {}): Promise<MockProvider> {
  const issuer = opts.issuer ?? "https://op.example.test";
  const alg = opts.alg ?? "ES256";
  const clientId = opts.clientId ?? "client-123";
  const clientSecret = opts.clientSecret ?? "s3cret-s3cret-s3cret";
  const now = opts.now ?? (() => Date.now());
  const pair = await generateKeyPair(alg);
  const foreign = await generateKeyPair(alg);
  const kid = "key-1";
  const jwk = { ...(await exportJwk(pair.publicKey)), kid, alg, use: "sig" };
  const codes = new Map<string, { nonce?: string; codeChallenge?: string; redirectUri?: string; used: boolean }>();
  const accessTokens = new Set<string>();
  const tamper: MockTamper = {};
  const calls: MockProvider["calls"] = [];
  const revoked: string[] = [];
  let n = 0;

  const discovery = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/jwks`,
    revocation_endpoint: `${issuer}/revoke`,
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: [alg],
  };

  function res(status: number, body: unknown, ct = "application/json") {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? ct : null) }, text: async () => text, json: async () => JSON.parse(text) };
  }

  async function idToken(accessToken: string, nonce?: string, sub = "user-42"): Promise<string> {
    const t = Math.floor(now() / 1000);
    const claims: Record<string, unknown> = {
      iss: tamper.iss ?? issuer,
      sub,
      aud: tamper.aud ?? clientId,
      exp: tamper.exp ?? t + 3600,
      iat: tamper.iat ?? t,
      email: "ada@example.test",
      email_verified: true,
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
      picture: "https://img.example.test/ada.png",
      tid: "tenant-abc",
    };
    if (tamper.azp) claims["azp"] = tamper.azp;
    if (tamper.nonce !== null) {
      const nn = tamper.nonce ?? nonce;
      if (nn) claims["nonce"] = nn;
    }
    if (tamper.atHash !== null) claims["at_hash"] = tamper.atHash ?? (await accessTokenHash(accessToken, tamper.alg ?? alg));
    const key = tamper.foreignKey ? foreign.privateKey : pair.privateKey;
    const a = tamper.alg ?? alg;
    return sign(claims, a.startsWith("HS") ? clientSecret : key, { algorithm: a, keyId: tamper.kid ?? kid });
  }

  const fetchImpl: FetchLike = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url, method, headers, body: init.body });
    const u = new URL(url);
    const path = u.pathname;
    if (path.endsWith("/.well-known/openid-configuration")) return res(200, discovery);
    if (path.endsWith("/jwks")) return res(200, { keys: [jwk] });
    if (path.endsWith("/token")) {
      if (tamper.tokenError) return res(tamper.tokenError.status, tamper.tokenError.body);
      if (method !== "POST" || headers["content-type"] !== "application/x-www-form-urlencoded") return res(400, { error: "invalid_request", error_description: "form-encoded POST required" });
      const p = new URLSearchParams(init.body ?? "");
      // client auth: post or basic
      let cid = p.get("client_id");
      let sec = p.get("client_secret");
      const basic = headers["authorization"];
      if (basic?.startsWith("Basic ")) {
        const [a, b] = Buffer.from(basic.slice(6), "base64").toString().split(":");
        cid = decodeURIComponent(a ?? "");
        sec = decodeURIComponent(b ?? "");
      }
      if (cid !== clientId) return res(401, { error: "invalid_client" });
      const grant = p.get("grant_type");
      const at = `at-${++n}`;
      accessTokens.add(at);
      if (grant === "authorization_code") {
        if (sec !== null && sec !== clientSecret) return res(401, { error: "invalid_client" });
        const rec = codes.get(p.get("code") ?? "");
        if (!rec || rec.used) return res(400, { error: "invalid_grant", error_description: "unknown or used code" });
        rec.used = true;
        if (rec.redirectUri && rec.redirectUri !== p.get("redirect_uri")) return res(400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
        if (rec.codeChallenge) {
          const v = p.get("code_verifier");
          if (!v || (await codeChallengeS256(v)) !== rec.codeChallenge) return res(400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        }
        const body: Record<string, unknown> = { access_token: at, token_type: "Bearer", expires_in: 3600, refresh_token: `rt-${n}`, scope: "openid email profile" };
        if (!tamper.omitIdToken) body["id_token"] = await idToken(at, rec.nonce);
        return res(200, body);
      }
      if (grant === "refresh_token") {
        if (!p.get("refresh_token")?.startsWith("rt-")) return res(400, { error: "invalid_grant" });
        return res(200, { access_token: at, token_type: "Bearer", expires_in: 1800, id_token: await idToken(at) });
      }
      if (grant === "client_credentials") {
        if (sec !== clientSecret) return res(401, { error: "invalid_client" });
        return res(200, { access_token: at, token_type: "Bearer", expires_in: 600, scope: p.get("scope") ?? "" });
      }
      return res(400, { error: "unsupported_grant_type" });
    }
    if (path.endsWith("/userinfo")) {
      const bearer = headers["authorization"]?.replace(/^Bearer /, "");
      if (!bearer || !accessTokens.has(bearer)) return res(401, { error: "invalid_token" });
      return res(200, { sub: tamper.userinfoSub ?? "user-42", email: "ada@example.test", email_verified: true, name: "Ada Lovelace", picture: "https://img.example.test/ada.png", preferred_username: "ada" });
    }
    if (path.endsWith("/revoke")) {
      const p = new URLSearchParams(init.body ?? "");
      revoked.push(p.get("token") ?? "");
      return res(200, "");
    }
    return res(404, { error: "not_found" });
  };

  return {
    issuer,
    clientId,
    clientSecret,
    fetch: fetchImpl,
    calls,
    tamper,
    revoked,
    discovery,
    issueCode(o) {
      const code = `code-${++n}`;
      codes.set(code, { ...o, used: false });
      return code;
    },
  };
}
