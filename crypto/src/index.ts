/**
 * @lacspace/crypto
 * Safe, boring cryptography — authenticated AES-256-GCM, key derivation, hashing.
 *
 * A thin, correct layer over the Web Crypto API (no hand-rolled crypto), so the
 * same code runs on Node 18+, edge runtimes, browsers and React Native. Encrypt
 * database fields, S3 object payloads, cookies and tokens with confidence.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error("Web Crypto unavailable — @lacspace/crypto needs Node 18+, an edge runtime or a browser");
  }
  return c;
}

/* ------------------------------ encoding ------------------------------ */

export function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  getCrypto().getRandomValues(buf);
  return buf;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 ? "0" + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? enc.encode(data) : data;
}

/** Constant-time comparison of two byte arrays or strings. */
export function constantTimeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const x = toBytes(a);
  const y = toBytes(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/* ------------------------------ hashing ------------------------------ */

export type HashAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";

export async function digest(
  data: string | Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
): Promise<Uint8Array> {
  const buf = await getCrypto().subtle.digest(algorithm, toBytes(data) as unknown as BufferSource);
  return new Uint8Array(buf);
}

/** SHA-256 hex digest. */
export async function sha256(data: string | Uint8Array): Promise<string> {
  return toHex(await digest(data, "SHA-256"));
}

/** HMAC signature (bytes). */
export async function hmac(
  key: string | Uint8Array,
  data: string | Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
): Promise<Uint8Array> {
  const c = getCrypto();
  const cryptoKey = await c.subtle.importKey(
    "raw",
    toBytes(key) as unknown as BufferSource,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const sig = await c.subtle.sign("HMAC", cryptoKey, toBytes(data) as unknown as BufferSource);
  return new Uint8Array(sig);
}

/** Verify an HMAC in constant time. */
export async function hmacVerify(
  key: string | Uint8Array,
  data: string | Uint8Array,
  signature: Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
): Promise<boolean> {
  return constantTimeEqual(await hmac(key, data, algorithm), signature);
}

/* ------------------------------ key derivation ------------------------------ */

export interface DeriveOptions {
  iterations?: number;
  hash?: HashAlgorithm;
  /** Derived key length in bytes. Default 32. */
  length?: number;
}

/** Derive raw key bytes from a password with PBKDF2. */
export async function deriveBits(
  password: string | Uint8Array,
  salt: Uint8Array,
  opts: DeriveOptions = {},
): Promise<Uint8Array> {
  const c = getCrypto();
  const baseKey = await c.subtle.importKey(
    "raw",
    toBytes(password) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await c.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: opts.iterations ?? 210000,
      hash: opts.hash ?? "SHA-256",
    },
    baseKey,
    (opts.length ?? 32) * 8,
  );
  return new Uint8Array(bits);
}

/* ------------------------------ AES-256-GCM ------------------------------ */

const AES_PREFIX = "v1";
const AES_PW_PREFIX = "v1p";
const DEFAULT_PW_ITERATIONS = 210000;

/** Generate a random 256-bit AES key as a base64url string. */
export function generateKey(): string {
  return toBase64url(randomBytes(32));
}

async function importAesKey(key: string | Uint8Array): Promise<CryptoKey> {
  const raw = typeof key === "string" ? fromBase64url(key) : key;
  if (raw.length !== 32) throw new Error("AES key must be 32 bytes (256-bit)");
  return getCrypto().subtle.importKey("raw", raw as unknown as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export interface AesOptions {
  /** Additional Authenticated Data — bound to the ciphertext (must match on decrypt). */
  aad?: string | Uint8Array;
}

function gcmParams(iv: Uint8Array, aad?: string | Uint8Array): AesGcmParams {
  const p: AesGcmParams = { name: "AES-GCM", iv: iv as unknown as BufferSource };
  if (aad !== undefined) p.additionalData = toBytes(aad) as unknown as BufferSource;
  return p;
}

/**
 * Encrypt with AES-256-GCM using a 32-byte key (base64url or bytes).
 * Returns a compact self-describing string: `v1:<iv>:<ciphertext>`.
 * Pass `opts.aad` to bind the ciphertext to a context (row id, tenant…).
 */
export async function encrypt(
  plaintext: string | Uint8Array,
  key: string | Uint8Array,
  opts: AesOptions = {},
): Promise<string> {
  const cryptoKey = await importAesKey(key);
  const iv = randomBytes(12);
  const ct = await getCrypto().subtle.encrypt(
    gcmParams(iv, opts.aad),
    cryptoKey,
    toBytes(plaintext) as unknown as BufferSource,
  );
  return `${AES_PREFIX}:${toBase64url(iv)}:${toBase64url(new Uint8Array(ct))}`;
}

async function decryptToBytes(payload: string, key: string | Uint8Array, opts: AesOptions): Promise<Uint8Array> {
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== AES_PREFIX) throw new Error("invalid ciphertext format");
  const cryptoKey = await importAesKey(key);
  const iv = fromBase64url(parts[1]!);
  const ct = fromBase64url(parts[2]!);
  const pt = await getCrypto().subtle.decrypt(gcmParams(iv, opts.aad), cryptoKey, ct as unknown as BufferSource);
  return new Uint8Array(pt);
}

/** Decrypt a string produced by {@link encrypt}. Returns the UTF-8 plaintext. */
export async function decrypt(payload: string, key: string | Uint8Array, opts: AesOptions = {}): Promise<string> {
  return dec.decode(await decryptToBytes(payload, key, opts));
}

/** Decrypt to raw bytes — binary-safe (files, protobufs, images). */
export async function decryptBytes(
  payload: string,
  key: string | Uint8Array,
  opts: AesOptions = {},
): Promise<Uint8Array> {
  return decryptToBytes(payload, key, opts);
}

/**
 * Encrypt with a passphrase (PBKDF2-derived key + AES-256-GCM).
 * Returns `v1p:<iterations>:<salt>:<iv>:<ciphertext>` — self-contained.
 */
export async function encryptWithPassword(
  plaintext: string | Uint8Array,
  password: string,
  opts: { iterations?: number } = {},
): Promise<string> {
  const iterations = opts.iterations ?? DEFAULT_PW_ITERATIONS;
  const salt = randomBytes(16);
  const key = await deriveBits(password, salt, { iterations, length: 32 });
  const inner = await encrypt(plaintext, key);
  const [, iv, ct] = inner.split(":");
  return `${AES_PW_PREFIX}:${iterations}:${toBase64url(salt)}:${iv}:${ct}`;
}

/** Decrypt a string produced by {@link encryptWithPassword}. */
export async function decryptWithPassword(payload: string, password: string): Promise<string> {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== AES_PW_PREFIX) throw new Error("invalid ciphertext format");
  const iterations = parseInt(parts[1]!, 10);
  const salt = fromBase64url(parts[2]!);
  const key = await deriveBits(password, salt, { iterations, length: 32 });
  return decrypt(`${AES_PREFIX}:${parts[3]}:${parts[4]}`, key);
}

/* ------------------------------ HKDF ------------------------------ */

export interface HkdfOptions {
  /** Optional salt (recommended). */
  salt?: Uint8Array;
  /** Context/label so the same master key yields different sub-keys per purpose. */
  info?: string | Uint8Array;
  /** Output length in bytes. Default 32. */
  length?: number;
  hash?: HashAlgorithm;
}

/**
 * HKDF: derive one or many purpose-bound sub-keys from a single master key.
 * @example const encKey = await hkdf(master, { info: "field-encryption", length: 32 });
 */
export async function hkdf(keyMaterial: string | Uint8Array, opts: HkdfOptions = {}): Promise<Uint8Array> {
  const c = getCrypto();
  const baseKey = await c.subtle.importKey("raw", toBytes(keyMaterial) as unknown as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await c.subtle.deriveBits(
    {
      name: "HKDF",
      hash: opts.hash ?? "SHA-256",
      salt: (opts.salt ?? new Uint8Array(0)) as unknown as BufferSource,
      info: toBytes(opts.info ?? "") as unknown as BufferSource,
    },
    baseKey,
    (opts.length ?? 32) * 8,
  );
  return new Uint8Array(bits);
}

/* ------------------------------ key rotation ------------------------------ */

const KEYRING_PREFIX = "v2";

export interface KeyringEntry {
  /** Stable key id (embedded in ciphertext; must not contain ":"). */
  id: string;
  /** 32-byte AES key (base64url string or bytes). */
  key: string | Uint8Array;
}

/**
 * A set of versioned AES keys for zero-downtime rotation. New data is encrypted
 * under the primary key; old ciphertext is decrypted by the key its `id` names.
 * Envelope: `v2:<keyId>:<iv>:<ciphertext>`.
 *
 * @example
 * const ring = new Keyring([{ id: "2025", key: oldKey }, { id: "2026", key: newKey }]);
 * const blob = await ring.encrypt("secret");     // uses "2026" (primary = last)
 * const text = await ring.decrypt(oldBlob);       // finds the right key by id
 * const fresh = await ring.reEncrypt(oldBlob);    // migrate to the primary key
 */
export class Keyring {
  private readonly keys = new Map<string, string | Uint8Array>();
  readonly primaryId: string;

  constructor(entries: KeyringEntry[], primaryId?: string) {
    if (!entries.length) throw new Error("Keyring needs at least one key");
    for (const e of entries) {
      if (e.id.includes(":")) throw new Error(`key id "${e.id}" must not contain ":"`);
      this.keys.set(e.id, e.key);
    }
    this.primaryId = primaryId ?? entries[entries.length - 1]!.id;
    if (!this.keys.has(this.primaryId)) throw new Error(`primary key "${this.primaryId}" is not in the keyring`);
  }

  /** Encrypt under the primary key. */
  async encrypt(plaintext: string | Uint8Array, opts: AesOptions = {}): Promise<string> {
    const inner = await encrypt(plaintext, this.keys.get(this.primaryId)!, opts);
    const [, iv, ct] = inner.split(":");
    return `${KEYRING_PREFIX}:${this.primaryId}:${iv}:${ct}`;
  }

  private resolve(payload: string): { key: string | Uint8Array; inner: string } {
    const parts = payload.split(":");
    if (parts[0] === KEYRING_PREFIX) {
      const kid = parts[1]!;
      const key = this.keys.get(kid);
      if (!key) throw new Error(`unknown key id "${kid}"`);
      return { key, inner: `${AES_PREFIX}:${parts[2]}:${parts[3]}` };
    }
    if (parts[0] === AES_PREFIX) return { key: this.keys.get(this.primaryId)!, inner: payload }; // legacy v1
    throw new Error("invalid ciphertext format");
  }

  async decrypt(payload: string, opts: AesOptions = {}): Promise<string> {
    const { key, inner } = this.resolve(payload);
    return decrypt(inner, key, opts);
  }

  async decryptBytes(payload: string, opts: AesOptions = {}): Promise<Uint8Array> {
    const { key, inner } = this.resolve(payload);
    return decryptBytes(inner, key, opts);
  }

  /** Re-encrypt under the primary key if it isn't already. Returns the (possibly new) payload. */
  async reEncrypt(payload: string, opts: AesOptions = {}): Promise<string> {
    const parts = payload.split(":");
    if (parts[0] === KEYRING_PREFIX && parts[1] === this.primaryId) return payload;
    const pt = await this.decryptBytes(payload, opts);
    return this.encrypt(pt, opts);
  }
}
