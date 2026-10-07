/**
 * WebCrypto helpers: key import/export, PEM/DER, base64.
 *
 * Everything goes through `crypto.subtle`. The only non-WebCrypto code path is
 * {@link getSubtle}'s fallback for Node 18 builds that do not expose
 * `globalThis.crypto`: it dynamically imports `node:crypto` and uses its
 * `webcrypto` object (still WebCrypto). Pass `crypto` explicitly to avoid it.
 */

import { DkimError } from "./tags";

export type DkimAlgorithm = "rsa-sha256" | "ed25519-sha256";

/** Minimal WebCrypto shape this package needs. */
export interface CryptoLike {
  subtle: SubtleCrypto;
}

let cachedSubtle: SubtleCrypto | undefined;

/** Resolve a SubtleCrypto: injected → globalThis.crypto → node:crypto webcrypto. */
export async function getSubtle(injected?: CryptoLike): Promise<SubtleCrypto> {
  if (injected?.subtle) return injected.subtle;
  const g = (globalThis as { crypto?: CryptoLike }).crypto;
  if (g?.subtle) return g.subtle;
  if (cachedSubtle) return cachedSubtle;
  try {
    const spec = "node:crypto";
    const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ spec)) as {
      webcrypto?: CryptoLike;
    };
    if (mod.webcrypto?.subtle) return (cachedSubtle = mod.webcrypto.subtle);
  } catch {
    /* fall through */
  }
  throw new DkimError("WebCrypto (crypto.subtle) is not available; pass { crypto } explicitly");
}

/** Typing shim: TS 5.7+ narrows BufferSource to ArrayBuffer-backed views. */
export function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

// ---------- base64 ----------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + "==";
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + "=";
  }
  return out;
}

export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/[\s=]+/g, "");
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new DkimError("invalid base64");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64.indexOf(clean[i]!);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

// ---------- DER / PEM ----------

function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  const b: number[] = [];
  while (n > 0) {
    b.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | b.length, ...b];
}

function der(tag: number, ...parts: (Uint8Array | number[])[]): Uint8Array {
  const body = concat(...parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p))));
  return concat(new Uint8Array([tag, ...derLen(body.length)]), body);
}

export function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

const OID_RSA = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
const OID_ED25519 = [0x06, 0x03, 0x2b, 0x65, 0x70];
const RSA_ALG_ID = [0x30, 0x0d, ...OID_RSA, 0x05, 0x00];
const ED25519_SPKI_PREFIX = new Uint8Array([0x30, 0x2a, 0x30, 0x05, ...OID_ED25519, 0x03, 0x21, 0x00]);
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, ...OID_ED25519, 0x04, 0x22, 0x04, 0x20,
]);

function contains(hay: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length && i < 64; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Detect the key algorithm from a PKCS#8 or SPKI DER blob. */
export function detectDerAlgorithm(d: Uint8Array): DkimAlgorithm | undefined {
  if (contains(d, OID_ED25519)) return "ed25519-sha256";
  if (contains(d, OID_RSA)) return "rsa-sha256";
  return undefined;
}

export interface Pem {
  label: string;
  der: Uint8Array;
}

export function parsePem(pem: string): Pem {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!m) throw new DkimError("not a PEM block");
  return { label: m[1]!, der: base64Decode(m[2]!) };
}

export function toPem(label: string, d: Uint8Array): string {
  const b = base64Encode(d);
  const lines = b.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/** Wrap a PKCS#1 RSAPrivateKey in PKCS#8. */
export function rsaPkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  return der(0x30, [0x02, 0x01, 0x00], RSA_ALG_ID, der(0x04, pkcs1));
}

/** Wrap a PKCS#1 RSAPublicKey in SubjectPublicKeyInfo. */
export function rsaPkcs1ToSpki(pkcs1: Uint8Array): Uint8Array {
  return der(0x30, RSA_ALG_ID, der(0x03, [0x00], pkcs1));
}

/** Build a PKCS#8 blob from a raw 32-byte Ed25519 private key seed. */
export function ed25519SeedToPkcs8(seed: Uint8Array): Uint8Array {
  if (seed.length !== 32) throw new DkimError("Ed25519 seed must be 32 bytes");
  return concat(ED25519_PKCS8_PREFIX, seed);
}

/** Wrap a raw 32-byte Ed25519 public key as SPKI. */
export function ed25519RawToSpki(raw: Uint8Array): Uint8Array {
  return concat(ED25519_SPKI_PREFIX, raw);
}

// ---------- WebCrypto key handling ----------

export function webAlgorithm(alg: DkimAlgorithm): RsaHashedImportParams | Algorithm {
  return alg === "rsa-sha256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "Ed25519" };
}

export function algorithmOfKey(key: CryptoKey): DkimAlgorithm | undefined {
  const n = key.algorithm.name.toLowerCase();
  if (n === "rsassa-pkcs1-v1_5") return "rsa-sha256";
  if (n === "ed25519") return "ed25519-sha256";
  return undefined;
}

/**
 * Import a private key for signing. Accepts a CryptoKey, a PKCS#8 PEM
 * ("PRIVATE KEY") or a PKCS#1 PEM ("RSA PRIVATE KEY").
 */
export async function importPrivateKey(
  key: CryptoKey | string,
  algorithm?: DkimAlgorithm,
  injected?: CryptoLike,
): Promise<{ key: CryptoKey; algorithm: DkimAlgorithm }> {
  if (typeof key !== "string") {
    const alg = algorithm ?? algorithmOfKey(key);
    if (!alg) throw new DkimError(`unsupported key algorithm ${key.algorithm.name}`);
    return { key, algorithm: alg };
  }
  const pem = parsePem(key);
  let pkcs8: Uint8Array;
  if (pem.label === "PRIVATE KEY") pkcs8 = pem.der;
  else if (pem.label === "RSA PRIVATE KEY") pkcs8 = rsaPkcs1ToPkcs8(pem.der);
  else if (pem.label === "ENCRYPTED PRIVATE KEY") throw new DkimError("encrypted private keys are not supported; decrypt first");
  else throw new DkimError(`unexpected PEM label "${pem.label}" (want PRIVATE KEY)`);
  const detected = detectDerAlgorithm(pkcs8);
  const alg = algorithm ?? detected;
  if (!alg) throw new DkimError("could not detect key algorithm; pass { algorithm }");
  if (detected && detected !== alg) throw new DkimError(`key is ${detected} but algorithm ${alg} was requested`);
  const subtle = await getSubtle(injected);
  const imported = await subtle.importKey("pkcs8", bs(pkcs8), webAlgorithm(alg), true, ["sign"]);
  return { key: imported, algorithm: alg };
}

/** Get the SPKI DER bytes for a public key given as PEM or CryptoKey. */
export async function publicKeySpki(
  key: CryptoKey | string,
  injected?: CryptoLike,
): Promise<{ spki: Uint8Array; algorithm: DkimAlgorithm }> {
  if (typeof key !== "string") {
    const alg = algorithmOfKey(key);
    if (!alg) throw new DkimError(`unsupported key algorithm ${key.algorithm.name}`);
    const subtle = await getSubtle(injected);
    if (key.type === "private") throw new DkimError("pass the public key, not the private key");
    return { spki: new Uint8Array(await subtle.exportKey("spki", key)), algorithm: alg };
  }
  const pem = parsePem(key);
  let spki: Uint8Array;
  if (pem.label === "PUBLIC KEY") spki = pem.der;
  else if (pem.label === "RSA PUBLIC KEY") spki = rsaPkcs1ToSpki(pem.der);
  else throw new DkimError(`unexpected PEM label "${pem.label}" (want PUBLIC KEY)`);
  const alg = detectDerAlgorithm(spki);
  if (!alg) throw new DkimError("could not detect public key algorithm");
  return { spki, algorithm: alg };
}

export async function sha256(data: Uint8Array, injected?: CryptoLike): Promise<Uint8Array> {
  const subtle = await getSubtle(injected);
  return new Uint8Array(await subtle.digest("SHA-256", bs(data)));
}
