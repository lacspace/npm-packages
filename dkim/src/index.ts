/**
 * @lacspace/dkim — DKIM signing and verification.
 * RFC 6376 (DKIM), RFC 8463 (Ed25519), RFC 8301 (crypto algorithm updates).
 * Pure WebCrypto, zero dependencies.
 */

export { signMessage, signHeader, DEFAULT_SIGNED_HEADERS, type SignOptions } from "./sign";
export {
  verifyMessage,
  fromDomainOf,
  type VerifyOptions,
  type VerifyResult,
  type DkimResult,
  type DkimStatus,
  type ResolveTxt,
} from "./verify";
export {
  generateKeyPair,
  dkimDnsRecord,
  chunkTxt,
  type GenerateKeyPairOptions,
  type DkimKeyPair,
  type DnsRecordOptions,
  type DkimDnsRecord,
} from "./keys";
export {
  parseDkimSignature,
  parseDkimKey,
  parseTagList,
  stripSignatureValue,
  DkimError,
  type DkimSignature,
  type DkimKey,
} from "./tags";
export { canonicalizeHeader, canonicalizeBody, type Canon } from "./canon";
export {
  importPrivateKey,
  ed25519SeedToPkcs8,
  toPem,
  type DkimAlgorithm,
  type CryptoLike,
} from "./crypto";
