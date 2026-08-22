/**
 * @lacspace/apikey
 * Issue and verify API keys the right way — show once, store only the hash.
 *
 * Generates prefixed, high-entropy keys (e.g. `lac_live_…`), returns the SHA-256
 * hash to store and the last 4 chars to display, and verifies in constant time.
 * You never persist the raw key.
 *
 * Zero dependencies (bar @lacspace/crypto) · isomorphic · fully typed.
 */

import { randomBytes, toBase64url, sha256, constantTimeEqual } from "@lacspace/crypto";

export interface ApiKeyOptions {
  /** Key prefix for identification, e.g. "lac_live". Default "lac". */
  prefix?: string;
  /** Random entropy in bytes. Default 24 (→ 32-char secret). */
  bytes?: number;
}

export interface GeneratedApiKey {
  /** The full secret — show ONCE, never store. */
  key: string;
  /** SHA-256 hash of the key — store THIS. */
  hash: string;
  /** The prefix (safe to store & display). */
  prefix: string;
  /** Last 4 chars, for "•••• abcd" displays. */
  last4: string;
}

/**
 * Generate an API key. Store `hash` + `prefix` + `last4`; return `key` to the
 * user exactly once.
 * @example const { key, hash } = await generateApiKey({ prefix: "lac_live" });
 */
export async function generateApiKey(opts: ApiKeyOptions = {}): Promise<GeneratedApiKey> {
  const prefix = opts.prefix ?? "lac";
  const secret = toBase64url(randomBytes(opts.bytes ?? 24));
  const key = `${prefix}_${secret}`;
  return {
    key,
    hash: await sha256(key),
    prefix,
    last4: key.slice(-4),
  };
}

/** Hash a raw API key for storage or lookup. */
export async function hashApiKey(key: string): Promise<string> {
  return sha256(key);
}

/** Verify a presented key against a stored hash (constant-time). */
export async function verifyApiKey(key: string, storedHash: string): Promise<boolean> {
  return constantTimeEqual(await sha256(key), storedHash);
}

/** Extract the prefix from a key (the part before the first underscore-group). */
export function parseApiKey(key: string): { prefix: string; last4: string } {
  const idx = key.lastIndexOf("_");
  return {
    prefix: idx > 0 ? key.slice(0, idx) : "",
    last4: key.slice(-4),
  };
}
