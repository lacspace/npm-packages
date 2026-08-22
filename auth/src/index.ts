/**
 * @lacspace/auth — authentication flows for Lacspace APIs, built on
 * `@lacspace/api`. Handles login, registration, the current user, logout,
 * and token refresh, and keeps the bearer token on the shared api client.
 */

import { LacspaceApi, type LacspaceApiOptions } from "@lacspace/api";

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

export interface LacspaceAuthOptions extends LacspaceApiOptions {
  /** Reuse an existing api client instead of creating a new one. */
  api?: LacspaceApi;
  /** Override endpoint paths to match your backend. */
  endpoints?: Partial<AuthEndpoints>;
}

export class LacspaceAuth {
  /** The underlying HTTP client — shared, so a login token applies everywhere. */
  readonly api: LacspaceApi;
  private readonly endpoints: AuthEndpoints;

  constructor(options: LacspaceAuthOptions = {}) {
    this.api = options.api ?? new LacspaceApi(options);
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints };
  }

  /** Manually set the bearer token (e.g. restored from storage). */
  setToken(token: string): this {
    this.api.setToken(token);
    return this;
  }

  getToken(): string | undefined {
    return this.api.getToken();
  }

  /** Log in; on success the returned token is applied to the api client. */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    const result = await this.api.post<AuthResult>(this.endpoints.login, credentials);
    if (result?.token) this.api.setToken(result.token);
    return result;
  }

  /** Register a new account; on success the token is applied to the api client. */
  async register(data: RegisterData): Promise<AuthResult> {
    const result = await this.api.post<AuthResult>(this.endpoints.register, data);
    if (result?.token) this.api.setToken(result.token);
    return result;
  }

  /** Fetch the currently authenticated user. */
  me(): Promise<LacspaceUser> {
    return this.api.get<LacspaceUser>(this.endpoints.me);
  }

  /** Invalidate the session on the server. */
  logout(): Promise<void> {
    return this.api.post<void>(this.endpoints.logout, {});
  }

  /** Exchange the current session for a fresh token. */
  async refresh(): Promise<AuthResult> {
    const result = await this.api.post<AuthResult>(this.endpoints.refresh, {});
    if (result?.token) this.api.setToken(result.token);
    return result;
  }
}

export function createAuth(options?: LacspaceAuthOptions): LacspaceAuth {
  return new LacspaceAuth(options);
}

export default LacspaceAuth;
