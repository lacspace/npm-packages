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

export function createAuth(options?: LacspaceAuthOptions): LacspaceAuth {
  return new LacspaceAuth(options);
}

export default LacspaceAuth;
