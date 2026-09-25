import { OAuthError } from "./errors.js";
import type { FetchLike } from "./util.js";

export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  [k: string]: unknown;
}

/** Fetch `<issuer>/.well-known/openid-configuration` and check the issuer matches (OIDC Discovery §4.3). */
export async function discover(issuer: string, opts: { fetch: FetchLike; requireIssuerMatch?: boolean }): Promise<DiscoveryDocument> {
  const base = issuer.replace(/\/+$/, "");
  const url = base.endsWith("/.well-known/openid-configuration") ? base : `${base}/.well-known/openid-configuration`;
  let res;
  try {
    res = await opts.fetch(url, { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new OAuthError(`discovery request to ${url} failed`, "discovery_failed", { cause });
  }
  if (!res.ok) throw new OAuthError(`discovery at ${url} returned ${res.status}`, "discovery_failed", { status: res.status });
  let doc: DiscoveryDocument;
  try {
    doc = JSON.parse(await res.text());
  } catch (cause) {
    throw new OAuthError("discovery document is not JSON", "discovery_failed", { cause });
  }
  if (typeof doc.issuer !== "string" || typeof doc.authorization_endpoint !== "string")
    throw new OAuthError("discovery document lacks issuer/authorization_endpoint", "discovery_failed");
  if (opts.requireIssuerMatch !== false && !base.endsWith("/.well-known/openid-configuration")) {
    const a = doc.issuer.replace(/\/+$/, "");
    if (a !== base) throw new OAuthError(`discovery issuer mismatch: expected ${base}, got ${doc.issuer}`, "discovery_failed");
  }
  return doc;
}
