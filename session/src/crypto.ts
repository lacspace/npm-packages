const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("Web Crypto is not available in this runtime (Node 20+, browsers, edge)");
  return c.subtle;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(b);
  return b;
}

export function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const utf8 = { encode: (s: string) => enc.encode(s), decode: (b: Uint8Array) => dec.decode(b) };

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", (typeof data === "string" ? enc.encode(data) : data) as unknown as BufferSource));
}

/** Short, stable identifier for a secret — lets the reader pick the right key without trial decrypts. */
export async function keyId(secret: string): Promise<string> {
  return toBase64url(await sha256("lacspace-session/kid:" + secret)).slice(0, 8);
}

/** HKDF-SHA256 (RFC 5869) from a secret string to a purpose-bound key. */
async function hkdf(secret: string, info: string, usage: "aes" | "hmac"): Promise<CryptoKey> {
  const ikm = await subtle().importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  const params: HkdfParams = { name: "HKDF", hash: "SHA-256", salt: enc.encode("lacspace-session/v1"), info: enc.encode(info) };
  return usage === "aes"
    ? subtle().deriveKey(params, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    : subtle().deriveKey(params, ikm, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function derived(secret: string, info: string, usage: "aes" | "hmac"): Promise<CryptoKey> {
  const k = `${usage}:${info}:${secret}`;
  let p = keyCache.get(k);
  if (!p) {
    p = hkdf(secret, info, usage);
    keyCache.set(k, p);
  }
  return p;
}

/** AES-256-GCM seal: returns base64url(iv || ciphertext || tag). `aad` binds the header. */
export async function seal(plain: Uint8Array, secret: string, info: string, aad: string, random: (n: number) => Uint8Array = randomBytes): Promise<string> {
  const key = await derived(secret, info, "aes");
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: enc.encode(aad) }, key, plain as unknown as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return toBase64url(out);
}

/** AES-256-GCM open; returns null on any failure (tamper, wrong key, wrong aad). */
export async function open(sealed: string, secret: string, info: string, aad: string): Promise<Uint8Array | null> {
  try {
    const buf = fromBase64url(sealed);
    if (buf.length < 12 + 16) return null;
    const key = await derived(secret, info, "aes");
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) as unknown as BufferSource, additionalData: enc.encode(aad) }, key, buf.subarray(12) as unknown as BufferSource);
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

export async function sign(data: string, secret: string, info: string): Promise<string> {
  const key = await derived(secret, info, "hmac");
  return toBase64url(new Uint8Array(await subtle().sign("HMAC", key, enc.encode(data))));
}

export async function verify(data: string, sig: string, secret: string, info: string): Promise<boolean> {
  try {
    const key = await derived(secret, info, "hmac");
    return await subtle().verify("HMAC", key, fromBase64url(sig) as unknown as BufferSource, enc.encode(data));
  } catch {
    return false;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
