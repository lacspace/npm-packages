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

/**
 * Encrypt with AES-256-GCM using a 32-byte key (base64url or bytes).
 * Returns a compact self-describing string: `v1:<iv>:<ciphertext>`.
 */
export async function encrypt(plaintext: string | Uint8Array, key: string | Uint8Array): Promise<string> {
  const cryptoKey = await importAesKey(key);
  const iv = randomBytes(12);
  const ct = await getCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    cryptoKey,
    toBytes(plaintext) as unknown as BufferSource,
  );
  return `${AES_PREFIX}:${toBase64url(iv)}:${toBase64url(new Uint8Array(ct))}`;
}

/** Decrypt a string produced by {@link encrypt}. Returns the UTF-8 plaintext. */
export async function decrypt(payload: string, key: string | Uint8Array): Promise<string> {
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== AES_PREFIX) throw new Error("invalid ciphertext format");
  const cryptoKey = await importAesKey(key);
  const iv = fromBase64url(parts[1]!);
  const ct = fromBase64url(parts[2]!);
  const pt = await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    cryptoKey,
    ct as unknown as BufferSource,
  );
  return dec.decode(pt);
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
