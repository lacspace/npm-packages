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

/** Basic shape check: `<prefix>_<secret>` with a non-trivial secret. Cheap offline reject. */
export function isValidKeyFormat(key: string): boolean {
  const idx = key.lastIndexOf("_");
  return idx > 0 && key.length - idx - 1 >= 16;
}

/* ------------------------------ adapters ------------------------------ */

export type HeadersLike =
  | Request
  | Headers
  | { headers: Headers | Record<string, string | string[] | undefined> }
  | Record<string, string | string[] | undefined>;

function readHeader(src: HeadersLike, name: string): string | undefined {
  const h: unknown = (src as { headers?: unknown }).headers ?? src;
  if (h && typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | string[] | undefined>;
  const v = rec[name] ?? rec[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

/** Read an API key from `x-api-key` or `Authorization: Bearer …`. */
export function extractApiKey(src: HeadersLike, opts: { headerName?: string } = {}): string | undefined {
  const named = readHeader(src, opts.headerName ?? "x-api-key");
  if (named) return named.trim();
  const auth = readHeader(src, "authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  return m ? m[1] : undefined;
}

/** A stored key record your `resolve` returns; must carry the `hash`. */
export interface ApiKeyRecord {
  hash: string;
  scopes?: string[];
  expiresAt?: number | Date;
  [k: string]: unknown;
}

export class ApiKeyError extends Error {
  constructor(
    message: string,
    public code: "missing" | "malformed" | "not_found" | "invalid" | "expired" | "scope",
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export interface AuthenticateApiKeyOptions {
  /** Look up the stored record by the key's prefix (or the raw key). Return null if unknown. */
  resolve: (parsed: { prefix: string; last4: string }, key: string) => Promise<ApiKeyRecord | null> | ApiKeyRecord | null;
  /** Required scopes — all must be present on the record. */
  scopes?: string[];
}

/** Verify a presented key against a resolved record (constant-time), checking expiry & scopes. */
export async function authenticateApiKey(key: string, opts: AuthenticateApiKeyOptions): Promise<ApiKeyRecord> {
  if (!key) throw new ApiKeyError("no api key", "missing");
  if (!isValidKeyFormat(key)) throw new ApiKeyError("malformed api key", "malformed");
  const record = await opts.resolve(parseApiKey(key), key);
  if (!record) throw new ApiKeyError("unknown api key", "not_found");
  if (!(await verifyApiKey(key, record.hash))) throw new ApiKeyError("invalid api key", "invalid");
  if (record.expiresAt !== undefined) {
    const exp = record.expiresAt instanceof Date ? record.expiresAt.getTime() : record.expiresAt;
    if (Date.now() > exp) throw new ApiKeyError("api key expired", "expired");
  }
  if (opts.scopes && opts.scopes.length) {
    const have = new Set(record.scopes ?? []);
    for (const s of opts.scopes) if (!have.has(s)) throw new ApiKeyError(`missing scope ${s}`, "scope");
  }
  return record;
}

/** Minimal Express-style middleware: verifies the API key → `req.apiKey`, else 401. */
export function expressApiKey(opts: AuthenticateApiKeyOptions & { headerName?: string; recordKey?: string }) {
  const recordKey = opts.recordKey ?? "apiKey";
  return async (
    req: { headers: Record<string, string | string[] | undefined>; [k: string]: unknown },
    res: { status: (n: number) => { json: (b: unknown) => unknown } },
    next: (err?: unknown) => void,
  ): Promise<void> => {
    try {
      const key = extractApiKey(req, { headerName: opts.headerName });
      req[recordKey] = await authenticateApiKey(key ?? "", opts);
      next();
    } catch (err) {
      const code = err instanceof ApiKeyError ? err.code : "invalid";
      res.status(401).json({ error: "unauthorized", code });
    }
  };
}
