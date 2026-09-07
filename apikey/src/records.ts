/**
 * @lacspace/apikey — key records
 *
 * Storage-agnostic helpers for the lifecycle of a hashed API key: identifiable
 * fingerprints, hierarchical scopes, expiry, rotation with a grace window,
 * revocation, and a verify variant that tells you WHICH stored hash matched
 * (so you can update last-used) without touching the original `verifyApiKey`.
 *
 * Pure + isomorphic — the library hashes & checks; the caller persists records.
 * Zero dependencies (bar @lacspace/crypto).
 */

import { randomBytes, sha256, constantTimeEqual } from "@lacspace/crypto";

/* ------------------------------ types ------------------------------ */

/**
 * A stored API-key record. A structural superset of {@link ApiKeyRecord}: it
 * still only requires `hash`, and every new field is optional, so existing
 * records keep working. The caller owns persistence — nothing here does IO.
 */
export interface StoredApiKey {
  /** Stable id/metadata handle, preserved across rotation. */
  id?: string;
  /** SHA-256 hash of the current secret — the thing you store & verify against. */
  hash: string;
  /** Previous secret's hash, kept alive during a rotation grace window. */
  previousHash?: string;
  /** When the previous hash stops verifying (epoch ms or Date). Absent ⇒ no grace. */
  previousHashExpiresAt?: number | Date;
  /** Scopes granted to this key (supports `*` / hierarchical `billing:*`). */
  scopes?: string[];
  /** Optional expiry (epoch ms or Date). */
  expiresAt?: number | Date;
  /** Hard revocation flag. */
  revoked?: boolean;
  /** When the key was/should be revoked (epoch ms or Date). */
  revokedAt?: number | Date;
  /** Last time the key verified — the caller updates this after a match. */
  lastUsedAt?: number | Date;
  [k: string]: unknown;
}

/* ------------------------------ time ------------------------------ */

function toMs(t: number | Date): number {
  return t instanceof Date ? t.getTime() : t;
}

/* --------------------- prefix / fingerprint / labels --------------------- */

/** Hex-encode bytes (a `_`-free secret alphabet), matching the generator. */
function toHexSecret(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * A short, public, non-reversible fingerprint of a key — safe to log or show in
 * a UI to identify a key without revealing the secret. Deterministic: the same
 * key always yields the same fingerprint (it's a prefix of the SHA-256 hash).
 * @example await fingerprint(key) // "fp_3b2c4d5e6f70"
 */
export async function fingerprint(key: string, opts: { length?: number; prefix?: string } = {}): Promise<string> {
  const len = opts.length ?? 12;
  const label = opts.prefix ?? "fp_";
  return label + (await sha256(key)).slice(0, len);
}

/**
 * Split a key into its parts. The secret is `_`-free (hex), so the prefix is
 * everything before the LAST underscore — preserving multi-segment prefixes
 * like "lac_live". Returns the raw `secret` too (the caller already holds `key`).
 */
export function parseKey(key: string): { prefix: string; secret: string; last4: string } {
  const idx = key.lastIndexOf("_");
  return {
    prefix: idx > 0 ? key.slice(0, idx) : "",
    secret: idx >= 0 ? key.slice(idx + 1) : key,
    last4: key.slice(-4),
  };
}

/**
 * A display-safe mask of a key: `"<prefix>_••••<last4>"`. Never reveals the
 * secret. Handy for account settings / audit logs.
 * @example maskKey("lac_live_9f8a…abcd") // "lac_live_••••abcd"
 */
export function maskKey(key: string, opts: { mask?: string } = {}): string {
  const { prefix, last4 } = parseKey(key);
  const dots = opts.mask ?? "••••";
  return prefix ? `${prefix}_${dots}${last4}` : `${dots}${last4}`;
}

/* ------------------------------ scopes ------------------------------ */

/** A record carrying scopes, or a bare scope list. */
export type ScopeSource = { scopes?: string[]; [k: string]: unknown } | readonly string[];

function toScopeList(recordOrScopes: ScopeSource | undefined): readonly string[] {
  if (!recordOrScopes) return [];
  return Array.isArray(recordOrScopes) ? recordOrScopes : (recordOrScopes as { scopes?: string[] }).scopes ?? [];
}

/**
 * Does a single granted scope satisfy a required scope? Supports:
 * - exact match (`read` ⇒ `read`)
 * - global wildcard (`*` ⇒ anything)
 * - trailing wildcard (`billing:*` ⇒ `billing`, `billing:read`, `billing:x:y`)
 * - hierarchical parent (`billing` ⇒ `billing:read`)
 */
export function scopeSatisfies(granted: string, required: string): boolean {
  if (granted === required || granted === "*") return true;
  if (granted.endsWith(":*")) {
    const base = granted.slice(0, -2);
    return required === base || required.startsWith(base + ":");
  }
  return required.startsWith(granted + ":");
}

/** Does the record (or scope list) grant `scope` (wildcard/hierarchical-aware)? */
export function hasScope(recordOrScopes: ScopeSource, scope: string): boolean {
  const granted = toScopeList(recordOrScopes);
  for (const g of granted) if (scopeSatisfies(g, scope)) return true;
  return false;
}

/** Does the record grant EVERY required scope? (Empty ⇒ true.) */
export function hasAllScopes(recordOrScopes: ScopeSource, scopes: readonly string[]): boolean {
  for (const s of scopes) if (!hasScope(recordOrScopes, s)) return false;
  return true;
}

/** Does the record grant AT LEAST ONE of the required scopes? (Empty ⇒ false.) */
export function hasAnyScope(recordOrScopes: ScopeSource, scopes: readonly string[]): boolean {
  for (const s of scopes) if (hasScope(recordOrScopes, s)) return true;
  return false;
}

/* ------------------------------ expiry ------------------------------ */

/**
 * Is the record expired? Matches `authenticateApiKey`'s semantics exactly:
 * expired iff `now > expiresAt`. No `expiresAt` ⇒ never expires.
 */
export function isExpired(record: { expiresAt?: number | Date; [k: string]: unknown }, now: number = Date.now()): boolean {
  if (record.expiresAt == null) return false;
  return now > toMs(record.expiresAt);
}

/* ------------------------------ revocation ------------------------------ */

/** Is the record revoked? (`revoked` flag, or `revokedAt` reached.) */
export function isRevoked(record: { revoked?: boolean; revokedAt?: number | Date; [k: string]: unknown }, now: number = Date.now()): boolean {
  if (record.revoked) return true;
  if (record.revokedAt != null) return now >= toMs(record.revokedAt);
  return false;
}

/** Return a copy of the record marked revoked (pure — does not mutate). */
export function revoke<T extends StoredApiKey>(record: T, now: number = Date.now()): T {
  return { ...record, revoked: true, revokedAt: now };
}

/** Is `id` present in a revocation list? Accepts any iterable of ids or a Set. */
export function isRevokedId(id: string, list: Iterable<string>): boolean {
  if (list instanceof Set) return list.has(id);
  for (const x of list) if (x === id) return true;
  return false;
}

/** Build a fast revocation-list lookup Set from any iterable of ids. */
export function revocationList(ids: Iterable<string>): Set<string> {
  return new Set(ids);
}

/* ------------------------------ rotation ------------------------------ */

export interface RotateOptions {
  /** Prefix for the new secret. Defaults to the record's `prefix`, else "lac". */
  prefix?: string;
  /** Random entropy in bytes. Default 24. */
  bytes?: number;
  /**
   * Grace window (ms) during which the OLD hash still verifies. `0`/absent ⇒
   * the old hash is dropped immediately.
   */
  graceMs?: number;
  /** Clock override (epoch ms), for the grace deadline. */
  now?: number;
}

export interface RotatedApiKey<T extends StoredApiKey = StoredApiKey> {
  /** The new secret — show ONCE, never store. */
  key: string;
  /** SHA-256 hash of the new secret (also set on `record.hash`). */
  hash: string;
  /** The prefix used. */
  prefix: string;
  /** Last 4 chars of the new key. */
  last4: string;
  /** The updated record — same id/metadata, new `hash`, optional grace fields. */
  record: T;
}

async function mintKey(prefix: string, bytes: number): Promise<{ key: string; hash: string; last4: string }> {
  const key = `${prefix}_${toHexSecret(randomBytes(bytes))}`;
  return { key, hash: await sha256(key), last4: key.slice(-4) };
}

/**
 * Rotate a key: issue a NEW secret while keeping the record's id & metadata.
 * With `graceMs`, the previous hash keeps verifying until the grace deadline so
 * in-flight clients aren't broken. Pure w.r.t. the input (returns a new record).
 * @example const { key, record } = await rotateApiKey(old, { graceMs: 86_400_000 });
 */
export async function rotateApiKey<T extends StoredApiKey>(record: T, opts: RotateOptions = {}): Promise<RotatedApiKey<T>> {
  const prefix = opts.prefix ?? (typeof record.prefix === "string" ? record.prefix : "lac");
  const bytes = opts.bytes ?? 24;
  const now = opts.now ?? Date.now();
  const minted = await mintKey(prefix, bytes);

  const next = { ...record, hash: minted.hash } as T;
  if (opts.graceMs && opts.graceMs > 0) {
    next.previousHash = record.hash;
    next.previousHashExpiresAt = now + opts.graceMs;
  } else {
    delete (next as StoredApiKey).previousHash;
    delete (next as StoredApiKey).previousHashExpiresAt;
  }
  return { key: minted.key, hash: minted.hash, prefix, last4: minted.last4, record: next };
}

/* --------------------- verify (which hash matched) --------------------- */

export interface KeyMatch<T extends StoredApiKey = StoredApiKey> {
  /** The record that matched. */
  record: T;
  /** Whether the CURRENT secret matched, or the PREVIOUS one (within grace). */
  matched: "current" | "previous";
}

export interface VerifyRecordOptions {
  /** Clock override (epoch ms). */
  now?: number;
  /** If true, also reject expired/revoked records (returns null). Default false. */
  active?: boolean;
}

/**
 * Verify a presented key against ONE stored record (constant-time), honouring a
 * rotation grace window. Returns which hash matched (so the caller can update
 * `lastUsedAt`) or `null`. Does NOT check expiry/revocation unless `active:true`.
 */
export async function verifyRecord<T extends StoredApiKey>(
  key: string,
  record: T,
  opts: VerifyRecordOptions = {},
): Promise<KeyMatch<T> | null> {
  const now = opts.now ?? Date.now();
  if (opts.active && (isExpired(record, now) || isRevoked(record, now))) return null;
  const presented = await sha256(key);
  if (constantTimeEqual(presented, record.hash)) return { record, matched: "current" };
  if (record.previousHash) {
    const graceOpen = record.previousHashExpiresAt == null || now <= toMs(record.previousHashExpiresAt);
    if (graceOpen && constantTimeEqual(presented, record.previousHash)) return { record, matched: "previous" };
  }
  return null;
}

/**
 * Verify a presented key against MANY stored records and return the first match
 * (with which hash matched), or `null`. Hashes the key once. Lets the caller
 * update last-used on the returned record — without changing `verifyApiKey`.
 */
export async function verifyKeyAgainst<T extends StoredApiKey>(
  key: string,
  records: Iterable<T>,
  opts: VerifyRecordOptions = {},
): Promise<KeyMatch<T> | null> {
  const now = opts.now ?? Date.now();
  const presented = await sha256(key);
  for (const record of records) {
    if (opts.active && (isExpired(record, now) || isRevoked(record, now))) continue;
    if (constantTimeEqual(presented, record.hash)) return { record, matched: "current" };
    if (record.previousHash) {
      const graceOpen = record.previousHashExpiresAt == null || now <= toMs(record.previousHashExpiresAt);
      if (graceOpen && constantTimeEqual(presented, record.previousHash)) return { record, matched: "previous" };
    }
  }
  return null;
}

/** Return a copy of the record with `lastUsedAt` set — convenience after a match. */
export function markUsed<T extends StoredApiKey>(record: T, now: number = Date.now()): T {
  return { ...record, lastUsedAt: now };
}
