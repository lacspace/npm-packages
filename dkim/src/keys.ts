/** Key generation and DNS record helpers. */

import { type CryptoLike, type DkimAlgorithm, base64Encode, getSubtle, publicKeySpki, toPem, webAlgorithm } from "./crypto";
import { DkimError } from "./tags";

export interface DnsRecordOptions {
  selector?: string;
  domain?: string;
  /** Default: detected from the key. */
  algorithm?: DkimAlgorithm;
  /** Adds t=y (domain is testing DKIM; receivers should not treat failures harshly). */
  testing?: boolean;
  /** Injected WebCrypto (only needed for CryptoKey input). */
  crypto?: CryptoLike;
}

export interface DkimDnsRecord {
  /** "<selector>._domainkey.<domain>" (placeholders if not given). */
  name: string;
  type: "TXT";
  /** The full record value, e.g. "v=DKIM1; k=rsa; p=MIIB…". */
  value: string;
  /** The value split into ≤255-character strings, for DNS UIs and zone files. */
  chunks: string[];
  /** A BIND zone-file line: `name. IN TXT ( "…" "…" )`. */
  zone: string;
}

/** Split a string into ≤255-character DNS character-strings. */
export function chunkTxt(value: string, size = 255): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += size) out.push(value.slice(i, i + size));
  return out.length ? out : [""];
}

/**
 * Build the DKIM DNS TXT record for a public key (PEM "PUBLIC KEY" /
 * "RSA PUBLIC KEY", or a public CryptoKey).
 */
export async function dkimDnsRecord(publicKey: CryptoKey | string, options: DnsRecordOptions = {}): Promise<DkimDnsRecord> {
  const { spki, algorithm: detected } = await publicKeySpki(publicKey, options.crypto);
  const alg = options.algorithm ?? detected;
  if (alg !== detected) throw new DkimError(`key is ${detected} but algorithm ${alg} was requested`);
  // RFC 8463: Ed25519 keys are published as the raw 32-byte key, not SPKI.
  const p = alg === "ed25519-sha256" ? base64Encode(spki.slice(spki.length - 32)) : base64Encode(spki);
  const k = alg === "ed25519-sha256" ? "ed25519" : "rsa";
  const value = `v=DKIM1; k=${k};${options.testing ? " t=y;" : ""} p=${p}`;
  const name = `${options.selector ?? "<selector>"}._domainkey.${(options.domain ?? "<domain>").replace(/\.$/, "")}`;
  const chunks = chunkTxt(value);
  return {
    name,
    type: "TXT",
    value,
    chunks,
    zone: `${name}. IN TXT ( ${chunks.map((c) => `"${c.replace(/(["\\])/g, "\\$1")}"`).join(" ")} )`,
  };
}

export interface GenerateKeyPairOptions extends DnsRecordOptions {
  /** Default "rsa-sha256". */
  algorithm?: DkimAlgorithm;
  /** RSA modulus length. Default 2048 (minimum 1024; 2048+ recommended). */
  modulusLength?: number;
}

export interface DkimKeyPair {
  /** PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----"). Keep secret. */
  privateKeyPem: string;
  /** SPKI PEM ("-----BEGIN PUBLIC KEY-----"). */
  publicKeyPem: string;
  /** DNS record to publish. */
  dnsRecord: DkimDnsRecord;
  algorithm: DkimAlgorithm;
}

/** Generate a fresh DKIM key pair and its DNS record. */
export async function generateKeyPair(options: GenerateKeyPairOptions = {}): Promise<DkimKeyPair> {
  const alg = options.algorithm ?? "rsa-sha256";
  const subtle = await getSubtle(options.crypto);
  let pair: CryptoKeyPair;
  if (alg === "rsa-sha256") {
    const bits = options.modulusLength ?? 2048;
    if (bits < 1024) throw new DkimError("modulusLength must be at least 1024 (2048 recommended)");
    pair = (await subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
  } else if (alg === "ed25519-sha256") {
    pair = (await subtle.generateKey(webAlgorithm(alg), true, ["sign", "verify"])) as CryptoKeyPair;
  } else {
    throw new DkimError(`unsupported algorithm ${String(alg)}`);
  }
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const spki = new Uint8Array(await subtle.exportKey("spki", pair.publicKey));
  const publicKeyPem = toPem("PUBLIC KEY", spki);
  return {
    privateKeyPem: toPem("PRIVATE KEY", pkcs8),
    publicKeyPem,
    dnsRecord: await dkimDnsRecord(publicKeyPem, { ...options, algorithm: alg }),
    algorithm: alg,
  };
}
