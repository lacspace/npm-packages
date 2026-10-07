/** DKIM verification (RFC 6376 §6, RFC 8463, RFC 8301). */

import {
  type Canon,
  type HeaderField,
  binaryToBytes,
  canonicalizeBody,
  canonicalizeHeader,
  parseHeaderFields,
  selectHeaders,
  splitMessage,
  toBinary,
  toCrlf,
} from "./canon";
import {
  type CryptoLike,
  type DkimAlgorithm,
  base64Decode,
  base64Encode,
  bs,
  ed25519RawToSpki,
  getSubtle,
  rsaPkcs1ToSpki,
  sha256,
  webAlgorithm,
} from "./crypto";
import { type DkimKey, type DkimSignature, DkimError, parseDkimKey, parseDkimSignature, stripSignatureValue } from "./tags";

export type DkimStatus = "pass" | "fail" | "neutral" | "temperror" | "permerror" | "policy";

export type ResolveTxt = (name: string) => Promise<string[][]>;

export interface VerifyOptions {
  /** DNS TXT resolver. Default: `node:dns/promises` resolveTxt (dynamically imported). */
  resolveTxt?: ResolveTxt;
  /** Verification time (Date or ms since epoch). Default: now. */
  now?: Date | number;
  /** Evaluate at most this many DKIM-Signature headers (top-most first). Default 5. */
  maxSignatures?: number;
  /** RSA keys shorter than this are a permerror. Default 1024 (RFC 8301 floor). */
  minRsaBits?: number;
  /** Allowed clock skew for a t= in the future, in seconds. Default 300. */
  clockSkewSec?: number;
  /** When false, a signature using l= is reported as "policy" instead of "pass". Default true. */
  allowBodyLength?: boolean;
  /**
   * Maps a domain to its organizational domain for alignment. Default: a
   * PSL-free approximation (d= aligned if equal to the From domain or a
   * parent/child of it with at least two labels). Pass a Public Suffix List
   * based function for DMARC-grade alignment.
   */
  organizationalDomain?: (domain: string) => string;
  /** Injected WebCrypto (otherwise globalThis.crypto). */
  crypto?: CryptoLike;
}

export interface DkimResult {
  domain: string;
  selector: string;
  algorithm: string;
  status: DkimStatus;
  reason?: string;
  /** d= aligns (relaxed) with the From header's domain. */
  aligned?: boolean;
  /** e.g. "relaxed/relaxed". */
  canonicalization: string;
  signedHeaders: string[];
  bodyHashOk?: boolean;
  keyBits?: number;
  /** Key record has t=y. */
  testing?: boolean;
  /** i= value. */
  identity?: string;
  /** l= value, when the signature covers only part of the body. */
  bodyLength?: number;
}

export interface VerifyResult {
  results: DkimResult[];
  /** True when at least one signature passes and is aligned with From (and there is exactly one From header). */
  pass: boolean;
  /** Domain of the (first) From address, lower-cased. */
  fromDomain?: string;
}

class Outcome extends Error {
  constructor(
    public status: DkimStatus,
    message: string,
  ) {
    super(message);
  }
}

/** Extract the domain of the first address in a From header value. */
export function fromDomainOf(value: string): string | undefined {
  const v = value.replace(/\r\n/g, "").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\([^)]*\)/g, " ");
  const angle = /<([^>]*)>/.exec(v);
  const addr = angle ? angle[1]! : (v.split(",")[0] ?? "").trim();
  const at = addr.lastIndexOf("@");
  if (at < 0) return undefined;
  const d = addr
    .slice(at + 1)
    .trim()
    .replace(/[>\s].*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  return d || undefined;
}

function approxAligned(d: string, from: string): boolean {
  if (d === from) return true;
  const twoLabels = (x: string) => x.split(".").filter(Boolean).length >= 2;
  return (from.endsWith("." + d) && twoLabels(d)) || (d.endsWith("." + from) && twoLabels(from));
}

async function defaultResolveTxt(name: string): Promise<string[][]> {
  const spec = "node:dns/promises";
  const dns = (await import(/* @vite-ignore */ /* webpackIgnore: true */ spec)) as {
    resolveTxt: (n: string) => Promise<string[][]>;
  };
  return dns.resolveTxt(name);
}

const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ENOTFOUND_KEY"]);

async function fetchKey(name: string, resolve: ResolveTxt): Promise<DkimKey> {
  let records: string[][];
  try {
    records = await resolve(name);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code && NOT_FOUND.has(code)) throw new Outcome("permerror", `no key for signature (${name}: ${code})`);
    throw new Outcome("temperror", `DNS lookup failed for ${name}: ${(e as Error)?.message ?? String(e)}`);
  }
  if (!records || !records.length) throw new Outcome("permerror", `no key for signature (${name})`);
  let lastErr: string | undefined;
  for (const rec of records) {
    const txt = Array.isArray(rec) ? rec.join("") : String(rec);
    try {
      return parseDkimKey(txt);
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Outcome("permerror", `key record syntax error (${lastErr ?? "unparseable"})`);
}

const KEY_TYPE: Record<DkimAlgorithm, string> = { "rsa-sha256": "rsa", "ed25519-sha256": "ed25519" };

async function importPublic(
  key: DkimKey,
  alg: DkimAlgorithm,
  minRsaBits: number,
  injected?: CryptoLike,
): Promise<{ key: CryptoKey; bits: number }> {
  const subtle = await getSubtle(injected);
  let raw: Uint8Array;
  try {
    raw = base64Decode(key.publicKey);
  } catch {
    throw new Outcome("permerror", "key p= is not valid base64");
  }
  if (alg === "ed25519-sha256") {
    if (raw.length !== 32) throw new Outcome("permerror", "Ed25519 key must be 32 bytes");
    try {
      const k = await subtle.importKey("raw", bs(raw), { name: "Ed25519" }, false, ["verify"]);
      return { key: k, bits: 256 };
    } catch {
      try {
        const k = await subtle.importKey("spki", bs(ed25519RawToSpki(raw)), { name: "Ed25519" }, false, ["verify"]);
        return { key: k, bits: 256 };
      } catch (e) {
        throw new Outcome("temperror", `Ed25519 not supported by this WebCrypto (${(e as Error).message})`);
      }
    }
  }
  let k: CryptoKey;
  try {
    k = await subtle.importKey("spki", bs(raw), webAlgorithm(alg), false, ["verify"]);
  } catch {
    try {
      k = await subtle.importKey("spki", bs(rsaPkcs1ToSpki(raw)), webAlgorithm(alg), false, ["verify"]);
    } catch {
      throw new Outcome("permerror", "key p= is not a valid RSA public key");
    }
  }
  const bits = (k.algorithm as RsaHashedKeyAlgorithm).modulusLength;
  if (bits < minRsaBits) throw new Outcome("permerror", `RSA key too short (${bits} bits < ${minRsaBits})`);
  return { key: k, bits };
}

/**
 * Verify every DKIM-Signature on a message.
 * Never throws for a bad message; problems are reported per signature.
 */
export async function verifyMessage(raw: string | Uint8Array, options: VerifyOptions = {}): Promise<VerifyResult> {
  const now = Math.floor((options.now === undefined ? Date.now() : +options.now) / 1000);
  const maxSigs = options.maxSignatures ?? 5;
  const minRsaBits = options.minRsaBits ?? 1024;
  const skew = options.clockSkewSec ?? 300;
  const resolve = options.resolveTxt ?? defaultResolveTxt;
  const orgDomain = options.organizationalDomain;

  const msg = toCrlf(toBinary(raw));
  const { header, body } = splitMessage(msg);
  const fields = parseHeaderFields(header);
  const froms = fields.filter((f) => f.key === "from");
  const fromDomain = froms.length ? fromDomainOf(froms[0]!.value) : undefined;

  const sigFields = fields.filter((f) => f.key === "dkim-signature").slice(0, Math.max(0, maxSigs));
  const bodyHashCache = new Map<string, Promise<{ hash: string; length: number }>>();
  const bodyHash = (c: Canon, l?: number) => {
    const k = `${c}:${l ?? ""}`;
    let p = bodyHashCache.get(k);
    if (!p) {
      p = (async () => {
        const full = canonicalizeBody(body, c);
        const part = l === undefined ? full : full.slice(0, l);
        return { hash: base64Encode(await sha256(binaryToBytes(part), options.crypto)), length: full.length };
      })();
      bodyHashCache.set(k, p);
    }
    return p;
  };

  const results = await Promise.all(
    sigFields.map((f) =>
      verifyOne(f, fields, {
        now,
        minRsaBits,
        skew,
        resolve,
        bodyHash,
        fromDomain,
        multipleFrom: froms.length > 1,
        allowL: options.allowBodyLength !== false,
        orgDomain,
        crypto: options.crypto,
      }),
    ),
  );
  // A message with several From headers never counts as a pass (DMARC treats it as invalid).
  const pass = froms.length === 1 && results.some((r) => r.status === "pass" && r.aligned === true);
  return { results, pass, fromDomain };
}

interface Ctx {
  now: number;
  minRsaBits: number;
  skew: number;
  resolve: ResolveTxt;
  bodyHash: (c: Canon, l?: number) => Promise<{ hash: string; length: number }>;
  fromDomain?: string;
  multipleFrom: boolean;
  allowL: boolean;
  orgDomain?: (d: string) => string;
  crypto?: CryptoLike;
}

async function verifyOne(field: HeaderField, fields: HeaderField[], ctx: Ctx): Promise<DkimResult> {
  let sig: DkimSignature;
  try {
    sig = parseDkimSignature(field.value);
  } catch (e) {
    let d = "";
    let s = "";
    try {
      d = /(?:^|;)\s*d\s*=\s*([^;\s]+)/.exec(field.value)?.[1]?.toLowerCase() ?? "";
      s = /(?:^|;)\s*s\s*=\s*([^;\s]+)/.exec(field.value)?.[1] ?? "";
    } catch {
      /* ignore */
    }
    return {
      domain: d,
      selector: s,
      algorithm: /(?:^|;)\s*a\s*=\s*([^;\s]+)/.exec(field.value)?.[1]?.toLowerCase() ?? "",
      status: "permerror",
      reason: `signature syntax error: ${(e as Error).message}`,
      canonicalization: "",
      signedHeaders: [],
    };
  }

  const res: DkimResult = {
    domain: sig.domain,
    selector: sig.selector,
    algorithm: sig.algorithm,
    status: "neutral",
    canonicalization: `${sig.canonicalization.header}/${sig.canonicalization.body}`,
    signedHeaders: sig.headers,
    identity: sig.identity,
  };
  if (sig.bodyLength !== undefined) res.bodyLength = sig.bodyLength;
  if (ctx.fromDomain) {
    res.aligned = ctx.orgDomain
      ? ctx.orgDomain(sig.domain) === ctx.orgDomain(ctx.fromDomain)
      : approxAligned(sig.domain, ctx.fromDomain);
  } else res.aligned = false;

  try {
    // ---- tag checks
    if (sig.version !== "1") throw new Outcome("permerror", `incompatible version v=${sig.version}`);
    if (sig.algorithm === "rsa-sha1") throw new Outcome("permerror", "rsa-sha1 is not accepted (RFC 8301)");
    if (sig.algorithm !== "rsa-sha256" && sig.algorithm !== "ed25519-sha256")
      throw new Outcome("permerror", `unsupported algorithm a=${sig.algorithm}`);
    const alg = sig.algorithm as DkimAlgorithm;
    if (!sig.headers.includes("from")) throw new Outcome("permerror", "From is not in h=");
    const at = sig.identity.lastIndexOf("@");
    const iDomain = (at >= 0 ? sig.identity.slice(at + 1) : "").toLowerCase();
    if (at < 0 || !(iDomain === sig.domain || iDomain.endsWith("." + sig.domain)))
      throw new Outcome("permerror", "i= domain is not d= or a subdomain of it");
    if (!sig.query.split(":").some((q) => q.trim().toLowerCase() === "dns/txt"))
      throw new Outcome("permerror", `unsupported query method q=${sig.query}`);
    if (sig.timestamp !== undefined && sig.expires !== undefined && sig.expires < sig.timestamp)
      throw new Outcome("permerror", "x= is earlier than t=");
    if (sig.expires !== undefined && sig.expires < ctx.now) throw new Outcome("fail", "signature expired (x=)");
    if (sig.timestamp !== undefined && sig.timestamp > ctx.now + ctx.skew)
      throw new Outcome("policy", "signature timestamp t= is in the future");

    // ---- key
    const key = await fetchKey(`${sig.selector}._domainkey.${sig.domain}`, ctx.resolve);
    if (key.testing) res.testing = true;
    if (key.revoked) throw new Outcome("permerror", "key revoked (empty p=)");
    if (key.keyType !== KEY_TYPE[alg]) throw new Outcome("permerror", `key type k=${key.keyType} does not match a=${alg}`);
    if (key.hashAlgorithms.length && !key.hashAlgorithms.includes("sha256"))
      throw new Outcome("permerror", "key h= does not allow sha256");
    if (!key.services.includes("*") && !key.services.includes("email"))
      throw new Outcome("permerror", "key s= does not allow email");
    if (key.strict && iDomain !== sig.domain) throw new Outcome("permerror", "key t=s requires i= domain to equal d=");
    const pub = await importPublic(key, alg, ctx.minRsaBits, ctx.crypto);
    res.keyBits = pub.bits;

    // ---- body hash
    const bh = await ctx.bodyHash(sig.canonicalization.body, sig.bodyLength);
    if (sig.bodyLength !== undefined && sig.bodyLength > bh.length) {
      res.bodyHashOk = false;
      throw new Outcome("fail", "l= is longer than the body");
    }
    res.bodyHashOk = bh.hash === sig.bodyHash;
    if (!res.bodyHashOk) throw new Outcome("fail", "body hash did not verify");

    // ---- header hash
    const hc = sig.canonicalization.header;
    let data = "";
    for (const f of selectHeaders(fields, sig.headers, field)) {
      if (f) data += canonicalizeHeader(f.name, f.value, hc);
    }
    data += canonicalizeHeader(field.name, stripSignatureValue(field.value), hc).slice(0, -2);
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64Decode(sig.signature);
    } catch {
      throw new Outcome("permerror", "b= is not valid base64");
    }
    const subtle = await getSubtle(ctx.crypto);
    const bytes = binaryToBytes(data);
    const ok =
      alg === "rsa-sha256"
        ? await subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, pub.key, bs(sigBytes), bs(bytes))
        : await subtle.verify({ name: "Ed25519" }, pub.key, bs(sigBytes), bs(await sha256(bytes, ctx.crypto)));
    if (!ok) throw new Outcome("fail", "signature did not verify");

    if (sig.bodyLength !== undefined && !ctx.allowL)
      throw new Outcome("policy", "signature covers only part of the body (l=)");
    res.status = "pass";
    if (ctx.multipleFrom) res.reason = "message has more than one From header";
    else if (sig.bodyLength !== undefined && sig.bodyLength < bh.length)
      res.reason = `only the first ${sig.bodyLength} of ${bh.length} body octets are signed (l=)`;
  } catch (e) {
    if (e instanceof Outcome) {
      res.status = e.status;
      res.reason = e.message;
    } else if (e instanceof DkimError) {
      res.status = "permerror";
      res.reason = e.message;
    } else {
      res.status = "temperror";
      res.reason = (e as Error)?.message ?? String(e);
    }
  }
  return res;
}
