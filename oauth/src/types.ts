import type { FetchLike } from "./util.js";

export type TokenEndpointAuth = "client_secret_post" | "client_secret_basic" | "none";

/** The standard OIDC claims plus whatever the provider adds. */
export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  azp?: string;
  at_hash?: string;
  auth_time?: number;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  preferred_username?: string;
  locale?: string;
  [claim: string]: unknown;
}

/** What comes back from the token endpoint, parsed and normalised. */
export interface Tokens {
  accessToken: string;
  /** "Bearer" almost always. */
  tokenType: string;
  refreshToken?: string;
  idToken?: string;
  /** Present when `idToken` was returned and verified. */
  idTokenClaims?: IdTokenClaims;
  /** Epoch milliseconds, when `expires_in` was returned. */
  expiresAt?: number;
  scope?: string;
  /** The full JSON the provider returned. */
  raw: Record<string, unknown>;
}

/** A provider-agnostic identity. Everything optional except `id` — providers differ. */
export interface Profile {
  /** Stable user id at the provider (`sub`). */
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  username?: string;
  picture?: string;
  locale?: string;
  /** The provider's raw response(s). */
  raw: Record<string, unknown>;
}

export interface ProfileContext {
  tokens: Tokens;
  fetch: FetchLike;
  config: ProviderConfig;
}

export interface ProviderConfig {
  /** Short id, e.g. "google" — surfaces in errors and `Profile.raw.provider`. */
  id: string;
  clientId: string;
  /** Omit for public clients (PKCE only). Apple: use `createAppleClientSecret`. */
  clientSecret?: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  revocationEndpoint?: string;
  jwksUri?: string;
  /**
   * Expected `iss` of ID tokens (and of the RFC 9207 `iss` callback parameter).
   * A string is compared exactly; "{tenantid}" inside it is replaced by the
   * token's `tid` claim (Microsoft); a function decides.
   */
  issuer?: string | ((iss: string, claims: IdTokenClaims) => boolean);
  /** Default scopes when `authorizationUrl` gets none. */
  scopes?: string[];
  /** " " (default) — a few providers want ",". */
  scopeSeparator?: string;
  /** Use PKCE S256. Default true. */
  pkce?: boolean;
  /** Default: client_secret_post when a secret is set, else none. */
  tokenEndpointAuth?: TokenEndpointAuth;
  /** Extra query params on the authorization redirect (e.g. `access_type: "offline"`). */
  authorizationParams?: Record<string, string>;
  /** Extra headers on userinfo requests (GitHub needs a User-Agent). */
  userinfoHeaders?: Record<string, string>;
  /** Allowed ID-token algorithms. Default RS256/RS384/RS512/ES256/ES384/ES512/EdDSA (+HS* when a secret is set). */
  idTokenAlgorithms?: string[];
  /** Turn the raw userinfo/ID-token/token-response into a Profile. */
  profile?: (raw: Record<string, unknown>, ctx: ProfileContext) => Profile | Promise<Profile>;
  /** Resolve endpoints lazily from `<issuer>/.well-known/openid-configuration` on first use. */
  discover?: string;
}

export interface ClientOptions {
  fetch?: FetchLike;
  random?: (n: number) => Uint8Array;
  /** Epoch ms. */
  now?: () => number;
  /** Seconds of clock skew tolerated on ID-token times. Default 60. */
  clockTolerance?: number;
  /** Reject ID tokens issued more than this many seconds ago. Default: not checked. */
  maxTokenAge?: number;
}

export interface AuthorizationUrlOptions {
  scope?: string | string[];
  state?: string;
  nonce?: string;
  codeVerifier?: string;
  redirectUri?: string;
  /** e.g. "consent", "select_account", "login". */
  prompt?: string;
  loginHint?: string;
  /** Any extra params, merged last. */
  params?: Record<string, string>;
}

export interface AuthorizationUrl {
  url: string;
  state: string;
  codeVerifier?: string;
  nonce?: string;
}

export interface CallbackParams {
  code?: string;
  state?: string;
  iss?: string;
  error?: string;
  errorDescription?: string;
  errorUri?: string;
  /** Apple sends the user's name as a JSON string on the first sign-in only. */
  user?: string;
  [extra: string]: string | undefined;
}

export interface CallbackExpectations {
  /** The state you stored before redirecting. Required. */
  state: string;
  codeVerifier?: string;
  nonce?: string;
  redirectUri?: string;
}

export interface ExchangeOptions {
  code: string;
  codeVerifier?: string;
  nonce?: string;
  redirectUri?: string;
  /** Extra form fields for the token request. */
  params?: Record<string, string>;
}
