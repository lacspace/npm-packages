/**
 * @lacspace/auth — authentication flows for Lacspace APIs, built on
 * `@lacspace/api`. Handles login, registration, the current user, logout,
 * and token refresh, and keeps the bearer token on the shared api client.
 */

import { LacspaceApi, isApiError, type LacspaceApiOptions } from "@lacspace/api";

/** Where the bearer token is persisted between page loads / restarts. */
export interface TokenStorage {
  get(): string | null | undefined | Promise<string | null | undefined>;
  set(token: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** In-memory token storage (default; lost on reload). */
export function memoryTokenStorage(): TokenStorage {
  let token: string | undefined;
  return { get: () => token, set: (t) => { token = t; }, clear: () => { token = undefined; } };
}

/** Browser localStorage token storage (persists across reloads). */
export function localStorageTokenStorage(key = "lacspace_token"): TokenStorage {
  const ls = () => (typeof localStorage !== "undefined" ? localStorage : undefined);
  return {
    get: () => ls()?.getItem(key) ?? undefined,
    set: (t) => ls()?.setItem(key, t),
    clear: () => ls()?.removeItem(key),
  };
}

export interface LacspaceUser {
  id: string;
  username?: string;
  email?: string;
  [key: string]: unknown;
}

export interface AuthResult {
  token: string;
  user: LacspaceUser;
  [key: string]: unknown;
}

export interface LoginCredentials {
  /** Provide either `username` or `email`, plus `password`. */
  username?: string;
  email?: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  [key: string]: unknown;
}

export interface AuthEndpoints {
  login: string;
  register: string;
  me: string;
  logout: string;
  refresh: string;
}

const DEFAULT_ENDPOINTS: AuthEndpoints = {
  login: "auth/login",
  register: "auth/register",
  me: "auth/me",
  logout: "auth/logout",
  refresh: "auth/refresh",
};

export type AuthListener = (user: LacspaceUser | null) => void;

export interface LacspaceAuthOptions extends LacspaceApiOptions {
  /** Reuse an existing api client instead of creating a new one. */
  api?: LacspaceApi;
  /** Override endpoint paths to match your backend. */
  endpoints?: Partial<AuthEndpoints>;
  /** Persist the token (e.g. localStorage). Default: in-memory. */
  storage?: TokenStorage;
  /** On a 401, call refresh() once and retry the request automatically. */
  autoRefresh?: boolean;
  /** Called whenever the signed-in user changes (login/register/refresh/logout). */
  onAuthChange?: AuthListener;
}

export class LacspaceAuth {
  /** The underlying HTTP client — shared, so a login token applies everywhere. */
  readonly api: LacspaceApi;
  private readonly endpoints: AuthEndpoints;
  private readonly storage: TokenStorage;
  private currentUser: LacspaceUser | null = null;
  private listeners = new Set<AuthListener>();
  private refreshing: Promise<AuthResult> | null = null;

  constructor(options: LacspaceAuthOptions = {}) {
    this.api = options.api ?? new LacspaceApi(options);
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints };
    this.storage = options.storage ?? memoryTokenStorage();
    if (options.onAuthChange) this.listeners.add(options.onAuthChange);
    if (options.autoRefresh) this.installAutoRefresh();
  }

  /** Subscribe to auth-state changes. Returns an unsubscribe function. */
  subscribe(fn: AuthListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.currentUser);
  }

  /** The last known signed-in user (null if signed out / unknown). */
  get user(): LacspaceUser | null {
    return this.currentUser;
  }

  private async applyToken(token: string): Promise<void> {
    this.api.setToken(token);
    await this.storage.set(token);
  }

  /** Manually set the bearer token (e.g. restored from storage). */
  setToken(token: string): this {
    this.api.setToken(token);
    void this.storage.set(token);
    return this;
  }

  getToken(): string | undefined {
    return this.api.getToken();
  }

  /** Restore a token from storage and (optionally) fetch the current user. */
  async restore(opts: { fetchUser?: boolean } = {}): Promise<LacspaceUser | null> {
    const token = await this.storage.get();
    if (!token) return null;
    this.api.setToken(token);
    if (opts.fetchUser) {
      try {
        this.currentUser = await this.me();
        this.emit();
      } catch {
        return null;
      }
    }
    return this.currentUser;
  }

  /** Log in; on success the returned token is applied to the api client. */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    const result = await this.api.post<AuthResult>(this.endpoints.login, credentials);
    if (result?.token) await this.applyToken(result.token);
    if (result?.user) this.currentUser = result.user;
    this.emit();
    return result;
  }

  /** Register a new account; on success the token is applied to the api client. */
  async register(data: RegisterData): Promise<AuthResult> {
    const result = await this.api.post<AuthResult>(this.endpoints.register, data);
    if (result?.token) await this.applyToken(result.token);
    if (result?.user) this.currentUser = result.user;
    this.emit();
    return result;
  }

  /** Fetch the currently authenticated user (updates `user` + notifies listeners). */
  async me(): Promise<LacspaceUser> {
    const user = await this.api.get<LacspaceUser>(this.endpoints.me);
    this.currentUser = user;
    this.emit();
    return user;
  }

  /** Invalidate the session on the server and clear the local token. */
  async logout(): Promise<void> {
    try {
      await this.api.post<void>(this.endpoints.logout, {});
    } finally {
      this.api.setToken("");
      await this.storage.clear();
      this.currentUser = null;
      this.emit();
    }
  }

  /** Exchange the current session for a fresh token (concurrent calls are de-duped). */
  refresh(): Promise<AuthResult> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const result = await this.api.post<AuthResult>(this.endpoints.refresh, {});
      if (result?.token) await this.applyToken(result.token);
      if (result?.user) {
        this.currentUser = result.user;
        this.emit();
      }
      return result;
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Build an `Authorization` header from the current token (empty object if none). */
  authHeader(): { Authorization: string } | Record<string, never> {
    const token = this.getToken();
    return token ? bearerHeader(token) : {};
  }

  /** Expiry of the current token as epoch ms, or null if none / not a JWT with `exp`. */
  expiresAt(): number | null {
    const token = this.getToken();
    return token ? getTokenExpiry(token) : null;
  }

  /**
   * True when a token is present and (if it is a JWT with `exp`) not expired.
   * A token without an `exp` claim counts as authenticated. Clock is injectable.
   */
  isAuthenticated(opts: ExpiryOptions = {}): boolean {
    const token = this.getToken();
    if (!token) return false;
    return !isTokenExpired(token, opts);
  }

  /** True if the current user carries the given role (see {@link hasRole}). */
  userHasRole(role: string, opts?: RoleCheckOptions): boolean {
    return hasRole(this.currentUser, role, opts);
  }

  /** True if the current user carries the given scope on `scopeClaim` (default `scope`). */
  userHasScope(scope: string, opts: { scopeClaim?: string } = {}): boolean {
    const claim = opts.scopeClaim ?? "scope";
    const raw = this.currentUser
      ? (this.currentUser as Record<string, unknown>)[claim]
      : undefined;
    return hasScope(raw as string | string[] | null | undefined, scope);
  }

  /**
   * Proactively call {@link refresh} shortly before the current token expires,
   * rescheduling after each refresh. All timing IO is injectable (`setTimer`,
   * `clearTimer`, `clock`) so this is fully testable without real timers.
   * Returns a stop function. No-op when the token has no `exp` claim.
   */
  startAutoRefresh(opts: StartAutoRefreshOptions = {}): () => void {
    const setTimer =
      opts.setTimer ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms));
    const clearTimer =
      opts.clearTimer ??
      ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>));
    let handle: unknown = null;
    let stopped = false;
    const scheduleNext = (): void => {
      if (stopped) return;
      const token = this.getToken();
      if (!token) return;
      const delay = refreshDelayMs(token, opts);
      if (delay === null) return;
      handle = setTimer(() => {
        if (stopped) return;
        this.refresh()
          .then((result) => {
            opts.onRefresh?.(result);
            scheduleNext();
          })
          .catch((err) => opts.onError?.(err));
      }, delay);
    };
    scheduleNext();
    return () => {
      stopped = true;
      if (handle !== null) clearTimer(handle);
    };
  }

  /** Wrap api.request so a 401 triggers a single refresh + retry. */
  private installAutoRefresh(): void {
    const orig = this.api.request.bind(this.api);
    const refreshPath = this.endpoints.refresh;
    // Track which opts objects belong to a post-refresh retry WITHOUT writing a
    // marker into the object itself (it would leak into the fetch RequestInit).
    const retried = new WeakSet<object>();
    (this.api as { request: unknown }).request = async (
      method: string,
      path: string,
      body?: unknown,
      opts?: Record<string, unknown>,
    ): Promise<unknown> => {
      try {
        return await orig(method, path, body, opts);
      } catch (e) {
        if (isApiError(e) && e.status === 401 && path !== refreshPath && !(opts && retried.has(opts))) {
          try {
            await this.refresh();
          } catch {
            throw e;
          }
          const retryOpts = { ...(opts ?? {}) };
          retried.add(retryOpts);
          return orig(method, path, body, retryOpts as Parameters<typeof orig>[3]);
        }
        throw e;
      }
    };
  }
}

/* ------------------------------------------------------------------ *
 * New in 2.2 — pure, isomorphic, dependency-free auth utilities.
 * Every function that touches randomness, hashing or the clock takes an
 * injectable implementation so it stays deterministic and IO-free in tests.
 * ------------------------------------------------------------------ */

/** A monotonic-ish clock returning epoch milliseconds. Defaults to `Date.now`. */
export type Clock = () => number;

/** Options for token-expiry checks. */
export interface ExpiryOptions {
  /** Clock returning epoch ms. Default: `Date.now`. */
  clock?: Clock;
  /** Treat the token as expired this many seconds early. Default 0. */
  leewaySec?: number;
}

/** Options for computing when a token should be refreshed. */
export interface RefreshScheduleOptions {
  /** Clock returning epoch ms. Default: `Date.now`. */
  clock?: Clock;
  /** Refresh this many seconds before `exp`. Default 30. */
  skewSec?: number;
  /** Clamp the delay to at least this many ms. Default 0. */
  minMs?: number;
  /** Clamp the delay to at most this many ms. */
  maxMs?: number;
}

/** Options for {@link LacspaceAuth.startAutoRefresh}. */
export interface StartAutoRefreshOptions extends RefreshScheduleOptions {
  /** Schedule a callback. Default: `setTimeout`. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Cancel a scheduled callback. Default: `clearTimeout`. */
  clearTimer?: (handle: unknown) => void;
  /** Called after each successful proactive refresh. */
  onRefresh?: (result: AuthResult) => void;
  /** Called if a proactive refresh throws. */
  onError?: (err: unknown) => void;
}

function decodeBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // Node fallback (no @types/node dependency — reached only off-browser).
  const BufferCtor = (globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } }).Buffer;
  return BufferCtor ? BufferCtor.from(padded, "base64").toString("utf8") : "";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  let b64: string;
  if (typeof btoa === "function") {
    b64 = btoa(bin);
  } else {
    const BufferCtor = (globalThis as { Buffer?: { from(a: Uint8Array): { toString(e: string): string } } }).Buffer;
    b64 = BufferCtor ? BufferCtor.from(bytes).toString("base64") : "";
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a JWT payload (no signature verification). Returns null if not a JWT. */
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]!)) as T;
  } catch {
    return null;
  }
}

/** Expiry of a JWT as epoch ms, or null if it has no numeric `exp` claim. */
export function getTokenExpiry(token: string): number | null {
  const payload = decodeJwt<{ exp?: unknown }>(token);
  if (!payload || typeof payload.exp !== "number") return null;
  return payload.exp * 1000;
}

/**
 * Whether a JWT is expired (respecting `leewaySec`). A token with no `exp`
 * claim is never considered expired. Clock is injectable for tests.
 */
export function isTokenExpired(token: string, opts: ExpiryOptions = {}): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return false;
  const now = (opts.clock ?? Date.now)();
  const leeway = (opts.leewaySec ?? 0) * 1000;
  return now + leeway >= exp;
}

/** Milliseconds until a JWT expires (0 if already expired), or null if no `exp`. */
export function tokenTimeToLive(token: string, opts: { clock?: Clock } = {}): number | null {
  const exp = getTokenExpiry(token);
  if (exp === null) return null;
  return Math.max(0, exp - (opts.clock ?? Date.now)());
}

/**
 * Milliseconds until a token should be proactively refreshed
 * (`exp - skew - now`, clamped), or null if the token has no `exp`.
 */
export function refreshDelayMs(token: string, opts: RefreshScheduleOptions = {}): number | null {
  const exp = getTokenExpiry(token);
  if (exp === null) return null;
  const now = (opts.clock ?? Date.now)();
  const min = opts.minMs ?? 0;
  let delay = exp - (opts.skewSec ?? 30) * 1000 - now;
  if (delay < min) delay = min;
  if (opts.maxMs !== undefined && delay > opts.maxMs) delay = opts.maxMs;
  return delay;
}

/** `{ Authorization: "Bearer <token>" }`. */
export function bearerHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** `{ Authorization: "Basic <base64(user:pass)>" }`. Base64 encoder is injectable. */
export function basicHeader(
  username: string,
  password: string,
  opts: { encode?: (s: string) => string } = {},
): { Authorization: string } {
  const encode = opts.encode ?? defaultBase64Encode;
  return { Authorization: `Basic ${encode(`${username}:${password}`)}` };
}

function defaultBase64Encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  if (typeof btoa === "function") {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin);
  }
  const BufferCtor = (globalThis as { Buffer?: { from(a: Uint8Array): { toString(e: string): string } } }).Buffer;
  return BufferCtor ? BufferCtor.from(bytes).toString("base64") : "";
}

/** Normalise a space/comma-separated scope string (or array) to a string[]. */
export function parseScopes(scope: string | string[] | null | undefined): string[] {
  if (!scope) return [];
  const list = Array.isArray(scope) ? scope : scope.split(/[\s,]+/);
  return list.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Whether `required` is present in the granted scopes. */
export function hasScope(granted: string | string[] | null | undefined, required: string): boolean {
  return parseScopes(granted).includes(required);
}

/** Whether every one of `required` is present in the granted scopes. */
export function hasAllScopes(granted: string | string[] | null | undefined, required: string[]): boolean {
  const set = new Set(parseScopes(granted));
  return required.every((r) => set.has(r));
}

/** Whether at least one of `required` is present in the granted scopes. */
export function hasAnyScope(granted: string | string[] | null | undefined, required: string[]): boolean {
  const set = new Set(parseScopes(granted));
  return required.some((r) => set.has(r));
}

/** How to locate roles on a user object. */
export interface RoleCheckOptions {
  /** Claim holding the role(s). Default: try `roles`, then `role`. */
  roleClaim?: string;
}

/** Extract a user's roles as a string[] from `roles`/`role` (or a custom claim). */
export function getUserRoles(user: LacspaceUser | null | undefined, opts: RoleCheckOptions = {}): string[] {
  if (!user) return [];
  const raw = opts.roleClaim ? user[opts.roleClaim] : (user.roles ?? user.role);
  if (Array.isArray(raw)) return raw.filter((r): r is string => typeof r === "string" && r.length > 0);
  if (typeof raw === "string") return parseScopes(raw);
  return [];
}

/** Whether a user has the given role. */
export function hasRole(user: LacspaceUser | null | undefined, role: string, opts?: RoleCheckOptions): boolean {
  return getUserRoles(user, opts).includes(role);
}

/** Whether a user has at least one of the given roles. */
export function hasAnyRole(user: LacspaceUser | null | undefined, roles: string[], opts?: RoleCheckOptions): boolean {
  const set = new Set(getUserRoles(user, opts));
  return roles.some((r) => set.has(r));
}

/** Whether a user has all of the given roles. */
export function hasAllRoles(user: LacspaceUser | null | undefined, roles: string[], opts?: RoleCheckOptions): boolean {
  const set = new Set(getUserRoles(user, opts));
  return roles.every((r) => set.has(r));
}

/** Injectable CSPRNG: fill `n` bytes. Default: WebCrypto, falling back to Math.random. */
export type RandomBytes = (n: number) => Uint8Array;

/** Injectable SHA-256: hash bytes to bytes. Default: `crypto.subtle`. */
export type Sha256 = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;

const URLSAFE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** A URL-safe random string of `length` chars. Randomness is injectable. */
export function randomString(length = 43, opts: { random?: RandomBytes; alphabet?: string } = {}): string {
  const alphabet = opts.alphabet ?? URLSAFE_ALPHABET;
  const bytes = (opts.random ?? defaultRandomBytes)(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Random `state` value for an OAuth/OIDC request (CSRF guard). */
export function generateState(opts?: { random?: RandomBytes }): string {
  return randomString(32, opts);
}

/** Random `nonce` value for an OIDC request (replay guard). */
export function generateNonce(opts?: { random?: RandomBytes }): string {
  return randomString(32, opts);
}

/** Random PKCE `code_verifier` (RFC 7636, 43–128 chars). */
export function generateCodeVerifier(opts?: { random?: RandomBytes }): string {
  return randomString(64, opts);
}

async function defaultSha256(data: Uint8Array): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest?: (a: string, d: Uint8Array) => Promise<ArrayBuffer> } } }).crypto?.subtle;
  if (!subtle?.digest) throw new Error("WebCrypto SHA-256 unavailable; pass opts.sha256");
  return new Uint8Array(await subtle.digest("SHA-256", data));
}

/** Compute the S256 PKCE `code_challenge` for a verifier. Hasher is injectable. */
export async function codeChallengeS256(verifier: string, opts: { sha256?: Sha256 } = {}): Promise<string> {
  const digest = await (opts.sha256 ?? defaultSha256)(new TextEncoder().encode(verifier));
  return bytesToBase64Url(digest);
}

/** Options for {@link createPkcePair}. */
export interface PkceOptions {
  /** Supply the verifier instead of generating one. */
  verifier?: string;
  /** Injectable randomness for the generated verifier. */
  random?: RandomBytes;
  /** Injectable SHA-256 for the challenge. */
  sha256?: Sha256;
}

/** A PKCE verifier/challenge pair (`S256`). */
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

/** Generate a PKCE pair. Randomness and hashing are injectable for tests. */
export async function createPkcePair(opts: PkceOptions = {}): Promise<PkcePair> {
  const codeVerifier = opts.verifier ?? generateCodeVerifier({ random: opts.random });
  const codeChallenge = await codeChallengeS256(codeVerifier, { sha256: opts.sha256 });
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

/** Inputs for {@link buildAuthorizeUrl}. */
export interface AuthorizeUrlOptions {
  /** The provider's authorization endpoint. */
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  /** Default `"code"`. */
  responseType?: string;
  scope?: string | string[];
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  /** Default `"S256"` when a challenge is given. */
  codeChallengeMethod?: string;
  audience?: string;
  prompt?: string;
  /** Any additional query params. */
  extraParams?: Record<string, string>;
}

/** Build an OAuth 2.0 / OIDC authorization-redirect URL (pure, no IO). */
export function buildAuthorizeUrl(opts: AuthorizeUrlOptions): string {
  const url = new URL(opts.authorizationEndpoint);
  const p = url.searchParams;
  p.set("response_type", opts.responseType ?? "code");
  p.set("client_id", opts.clientId);
  p.set("redirect_uri", opts.redirectUri);
  if (opts.scope) p.set("scope", parseScopes(opts.scope).join(" "));
  if (opts.state) p.set("state", opts.state);
  if (opts.nonce) p.set("nonce", opts.nonce);
  if (opts.codeChallenge) {
    p.set("code_challenge", opts.codeChallenge);
    p.set("code_challenge_method", opts.codeChallengeMethod ?? "S256");
  }
  if (opts.audience) p.set("audience", opts.audience);
  if (opts.prompt) p.set("prompt", opts.prompt);
  if (opts.extraParams) for (const [k, v] of Object.entries(opts.extraParams)) p.set(k, v);
  return url.toString();
}

/** Parsed OAuth callback parameters. */
export interface AuthCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  [key: string]: string | undefined;
}

/** Parse the query/fragment of an OAuth redirect callback (URL or raw string). */
export function parseAuthCallback(input: string): AuthCallbackParams {
  let s = input.trim();
  const q = s.indexOf("?");
  const h = s.indexOf("#");
  if (q >= 0) {
    s = s.slice(q + 1);
    const hh = s.indexOf("#");
    if (hh >= 0) s = s.slice(0, hh);
  } else if (h >= 0) {
    s = s.slice(h + 1);
  } else {
    s = s.replace(/^[?#]/, "");
  }
  const params = new URLSearchParams(s);
  const out: AuthCallbackParams = {};
  for (const [k, v] of params) out[k] = v;
  if (out.error_description && out.errorDescription === undefined) out.errorDescription = out.error_description;
  return out;
}

/** Kinds of cross-tab auth broadcast message. */
export type AuthMessageType = "login" | "logout" | "refresh" | "token";

/** A cross-tab auth broadcast message (for `BroadcastChannel`/`storage` sync). */
export interface AuthMessage {
  type: AuthMessageType;
  token?: string | null;
  user?: LacspaceUser | null;
  at?: number;
}

const AUTH_MESSAGE_TAG = "@lacspace/auth";

/** Encode an auth message for cross-tab transport. */
export function encodeAuthMessage(message: AuthMessage): string {
  return JSON.stringify({ __tag: AUTH_MESSAGE_TAG, ...message });
}

/** Decode a cross-tab auth message. Returns null if it is not one of ours. */
export function decodeAuthMessage(raw: string): AuthMessage | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || obj.__tag !== AUTH_MESSAGE_TAG || typeof obj.type !== "string") return null;
    const { __tag: _tag, ...rest } = obj;
    void _tag;
    return rest as unknown as AuthMessage;
  } catch {
    return null;
  }
}

export function createAuth(options?: LacspaceAuthOptions): LacspaceAuth {
  return new LacspaceAuth(options);
}

export default LacspaceAuth;
