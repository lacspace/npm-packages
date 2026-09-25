export { parseCookies, serializeCookie, clearCookie, cookieHeaderOf, getCookie } from "./cookie.js";
export type { CookieOptions, CookieSource } from "./cookie.js";
export { createCookieSession, createOAuthStateStore } from "./session.js";
export type { SessionOptions, SessionMode, SessionState, SessionFailure, CommitOptions, CookieSession, OAuthStateData, OAuthStateStore, OAuthStateStoreOptions } from "./session.js";
export { createCsrf, constantTimeEqual } from "./csrf.js";
export type { CsrfOptions, Csrf } from "./csrf.js";
export { randomBytes, toBase64url, fromBase64url } from "./crypto.js";

/** Stash a one-shot message in session data (e.g. "Saved!"). */
export function setFlash<T extends Record<string, unknown>>(data: T, key: string, value: unknown): T & { _flash: Record<string, unknown> } {
  const flash = { ...((data as { _flash?: Record<string, unknown> })._flash ?? {}), [key]: value };
  return { ...data, _flash: flash };
}

/** Take (and remove) a flash message. Returns the value and the updated data to commit. */
export function takeFlash<T extends Record<string, unknown>>(data: T, key: string): { value: unknown; data: T } {
  const flash = { ...((data as { _flash?: Record<string, unknown> })._flash ?? {}) };
  const value = flash[key];
  delete flash[key];
  const next = { ...data } as T & { _flash?: Record<string, unknown> };
  if (Object.keys(flash).length) next._flash = flash;
  else delete next._flash;
  return { value, data: next };
}
