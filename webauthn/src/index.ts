/**
 * @lacspace/webauthn
 * Passkeys / biometric (FaceID, fingerprint, security keys) via WebAuthn.
 *
 * Browser ceremony helpers (base64url + navigator.credentials wrappers), server
 * challenge & options builders, and real assertion (login) verification over Web
 * Crypto — including ES256 DER→P1363 handling and a compact CBOR/COSE parser to
 * extract the public key at registration.
 *
 * Scope note: this performs origin / rpId / challenge / signature / counter
 * checks (the checks that matter for almost every app). It does NOT verify the
 * attestation-statement trust chain (device provenance) — i.e. it treats
 * registration like "none" attestation, the common configuration.
 *
 * Zero dependencies · isomorphic (Web Crypto) · fully typed.
 */

/* ------------------------------ encoding ------------------------------ */

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto unavailable — needs Node 18+, edge, or a browser");
  return c;
}

export function toBase64url(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  const s = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(b).toString("base64");
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

const dec = new TextDecoder();
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await getCrypto().subtle.digest("SHA-256", data as unknown as BufferSource));
}
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/* ------------------------------ CBOR (subset) ------------------------------ */

type CborValue = number | Uint8Array | string | CborValue[] | Map<number | string, CborValue> | boolean | null;

function cborDecodeItem(d: Uint8Array, p: number): [CborValue, number] {
  const ib = d[p++]!;
  const major = ib >> 5;
  const info = ib & 0x1f;
  let len = info;
  if (info === 24) len = d[p++]!;
  else if (info === 25) {
    len = (d[p]! << 8) | d[p + 1]!;
    p += 2;
  } else if (info === 26) {
    len = ((d[p]! << 24) | (d[p + 1]! << 16) | (d[p + 2]! << 8) | d[p + 3]!) >>> 0;
    p += 4;
  } else if (info === 27) {
    const hi = ((d[p]! << 24) | (d[p + 1]! << 16) | (d[p + 2]! << 8) | d[p + 3]!) >>> 0;
    const lo = ((d[p + 4]! << 24) | (d[p + 5]! << 16) | (d[p + 6]! << 8) | d[p + 7]!) >>> 0;
    len = hi * 2 ** 32 + lo;
    p += 8;
  }
  switch (major) {
    case 0:
      return [len, p];
    case 1:
      return [-1 - len, p];
    case 2:
      return [d.slice(p, p + len), p + len];
    case 3:
      return [dec.decode(d.slice(p, p + len)), p + len];
    case 4: {
      const arr: CborValue[] = [];
      for (let i = 0; i < len; i++) {
        const [v, np] = cborDecodeItem(d, p);
        arr.push(v);
        p = np;
      }
      return [arr, p];
    }
    case 5: {
      const map = new Map<number | string, CborValue>();
      for (let i = 0; i < len; i++) {
        const [k, np] = cborDecodeItem(d, p);
        const [v, np2] = cborDecodeItem(d, np);
        map.set(k as number | string, v);
        p = np2;
      }
      return [map, p];
    }
    case 7:
      if (info === 20) return [false, p];
      if (info === 21) return [true, p];
      if (info === 22) return [null, p];
      return [null, p];
    default:
      throw new Error("unsupported CBOR major type " + major);
  }
}

function cborDecode(d: Uint8Array): CborValue {
  return cborDecodeItem(d, 0)[0];
}

/* ------------------------------ COSE → JWK ------------------------------ */

export type CoseAlg = "ES256" | "RS256";

function coseAlgName(alg: number): CoseAlg {
  if (alg === -7) return "ES256";
  if (alg === -257) return "RS256";
  throw new Error(`unsupported COSE algorithm ${alg} (only ES256 / RS256)`);
}

function coseToJwk(cose: Map<number | string, CborValue>): JsonWebKey {
  const kty = cose.get(1);
  if (kty === 2) {
    const crv = cose.get(-1);
    return {
      kty: "EC",
      crv: crv === 1 ? "P-256" : crv === 2 ? "P-384" : "P-521",
      x: toBase64url(cose.get(-2) as Uint8Array),
      y: toBase64url(cose.get(-3) as Uint8Array),
      ext: true,
    };
  }
  if (kty === 3) {
    return { kty: "RSA", n: toBase64url(cose.get(-1) as Uint8Array), e: toBase64url(cose.get(-2) as Uint8Array), ext: true };
  }
  throw new Error(`unsupported COSE key type ${kty}`);
}

/* ------------------------------ authenticatorData ------------------------------ */

interface ParsedAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  credentialId?: Uint8Array;
  publicKeyCose?: Map<number | string, CborValue>;
}

function parseAuthData(bytes: Uint8Array): ParsedAuthData {
  const rpIdHash = bytes.slice(0, 32);
  const flags = bytes[32]!;
  const signCount = ((bytes[33]! << 24) | (bytes[34]! << 16) | (bytes[35]! << 8) | bytes[36]!) >>> 0;
  const result: ParsedAuthData = {
    rpIdHash,
    flags,
    userPresent: !!(flags & 0x01),
    userVerified: !!(flags & 0x04),
    signCount,
  };
  if (flags & 0x40) {
    const idLen = (bytes[53]! << 8) | bytes[54]!;
    result.credentialId = bytes.slice(55, 55 + idLen);
    result.publicKeyCose = cborDecode(bytes.slice(55 + idLen)) as Map<number | string, CborValue>;
  }
  return result;
}

/* ------------------------------ ECDSA DER → raw ------------------------------ */

function derToRaw(der: Uint8Array): Uint8Array {
  let offset = 2;
  if (der[1]! & 0x80) offset += der[1]! & 0x7f;
  if (der[offset] !== 0x02) throw new Error("invalid DER signature");
  offset++;
  const rLen = der[offset++]!;
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset] !== 0x02) throw new Error("invalid DER signature");
  offset++;
  const sLen = der[offset++]!;
  const s = der.slice(offset, offset + sLen);
  const norm = (b: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const trimmed = b.slice(i);
    const out = new Uint8Array(32);
    out.set(trimmed, 32 - trimmed.length);
    return out;
  };
  return concat(norm(r), norm(s));
}

/* ------------------------------ server: options ------------------------------ */

/** A cryptographically-random base64url challenge (store it for the ceremony). */
export function generateChallenge(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  getCrypto().getRandomValues(buf);
  return toBase64url(buf);
}

export interface RegistrationOptionsInput {
  rpName: string;
  rpID: string;
  userID: string;
  userName: string;
  userDisplayName?: string;
  challenge?: string;
  timeout?: number;
  /** "platform" (FaceID/fingerprint) or "cross-platform" (security keys). */
  authenticatorAttachment?: "platform" | "cross-platform";
  userVerification?: "required" | "preferred" | "discouraged";
  excludeCredentials?: string[];
}

/** Build `PublicKeyCredentialCreationOptions` (JSON, base64url) for the browser. */
export function generateRegistrationOptions(o: RegistrationOptionsInput) {
  const challenge = o.challenge ?? generateChallenge();
  return {
    challenge,
    rp: { name: o.rpName, id: o.rpID },
    user: { id: toBase64url(new TextEncoder().encode(o.userID)), name: o.userName, displayName: o.userDisplayName ?? o.userName },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: o.timeout ?? 60000,
    attestation: "none",
    authenticatorSelection: {
      authenticatorAttachment: o.authenticatorAttachment,
      userVerification: o.userVerification ?? "preferred",
      residentKey: "preferred",
    },
    excludeCredentials: (o.excludeCredentials ?? []).map((id) => ({ type: "public-key", id })),
  };
}

export interface AuthenticationOptionsInput {
  rpID: string;
  challenge?: string;
  timeout?: number;
  userVerification?: "required" | "preferred" | "discouraged";
  allowCredentials?: string[];
}

/** Build `PublicKeyCredentialRequestOptions` (JSON, base64url) for the browser. */
export function generateAuthenticationOptions(o: AuthenticationOptionsInput) {
  return {
    challenge: o.challenge ?? generateChallenge(),
    rpId: o.rpID,
    timeout: o.timeout ?? 60000,
    userVerification: o.userVerification ?? "preferred",
    allowCredentials: (o.allowCredentials ?? []).map((id) => ({ type: "public-key", id })),
  };
}

/* ------------------------------ server: verification ------------------------------ */

export interface RegistrationResult {
  verified: boolean;
  credentialId: string;
  publicKey: JsonWebKey;
  algorithm: CoseAlg;
  counter: number;
  /** Whether the authenticator verified the user (biometric / PIN) at registration. */
  userVerified: boolean;
}

export interface VerifyRegistrationInput {
  attestationObject: string; // base64url
  clientDataJSON: string; // base64url
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  /** Require the User-Verified (UV) flag — reject if biometric/PIN was not performed. */
  requireUserVerification?: boolean;
}

/** Verify a registration response and extract the credential's public key. */
export async function verifyRegistration(input: VerifyRegistrationInput): Promise<RegistrationResult> {
  const clientData = JSON.parse(dec.decode(fromBase64url(input.clientDataJSON)));
  if (clientData.type !== "webauthn.create") throw new Error("unexpected clientData type");
  if (clientData.challenge !== input.expectedChallenge) throw new Error("challenge mismatch");
  if (clientData.origin !== input.expectedOrigin) throw new Error("origin mismatch");

  const att = cborDecode(fromBase64url(input.attestationObject)) as Map<string, CborValue>;
  const authData = parseAuthData(att.get("authData") as Uint8Array);
  const expectedHash = await sha256(new TextEncoder().encode(input.expectedRPID));
  if (toBase64url(authData.rpIdHash) !== toBase64url(expectedHash)) throw new Error("rpID hash mismatch");
  if (!authData.credentialId || !authData.publicKeyCose) throw new Error("no attested credential data");
  if (input.requireUserVerification && !authData.userVerified)
    throw new Error("user verification required but UV flag not set");

  const alg = coseAlgName(authData.publicKeyCose.get(3) as number);
  return {
    verified: true,
    credentialId: toBase64url(authData.credentialId),
    publicKey: coseToJwk(authData.publicKeyCose),
    algorithm: alg,
    counter: authData.signCount,
    userVerified: authData.userVerified,
  };
}

export interface VerifyAuthenticationInput {
  authenticatorData: string; // base64url
  clientDataJSON: string; // base64url
  signature: string; // base64url
  publicKey: JsonWebKey;
  algorithm: CoseAlg;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  /** Stored sign counter — a non-increasing counter signals a cloned authenticator. */
  counter?: number;
  /** Require the User-Verified (UV) flag — reject if biometric/PIN was not performed. */
  requireUserVerification?: boolean;
}

export interface AuthenticationResult {
  verified: boolean;
  newCounter: number;
  /** Whether the authenticator verified the user (biometric / PIN) for this assertion. */
  userVerified: boolean;
}

/** Verify an authentication (login) assertion. Throws on any check failure. */
export async function verifyAuthentication(input: VerifyAuthenticationInput): Promise<AuthenticationResult> {
  const clientData = JSON.parse(dec.decode(fromBase64url(input.clientDataJSON)));
  if (clientData.type !== "webauthn.get") throw new Error("unexpected clientData type");
  if (clientData.challenge !== input.expectedChallenge) throw new Error("challenge mismatch");
  if (clientData.origin !== input.expectedOrigin) throw new Error("origin mismatch");

  const authDataBytes = fromBase64url(input.authenticatorData);
  const authData = parseAuthData(authDataBytes);
  const expectedHash = await sha256(new TextEncoder().encode(input.expectedRPID));
  if (toBase64url(authData.rpIdHash) !== toBase64url(expectedHash)) throw new Error("rpID hash mismatch");
  if (!authData.userPresent) throw new Error("user not present");
  if (input.requireUserVerification && !authData.userVerified)
    throw new Error("user verification required but UV flag not set");
  if (
    input.counter !== undefined &&
    authData.signCount !== 0 &&
    authData.signCount <= input.counter
  ) {
    throw new Error("sign counter did not increase — possible cloned authenticator");
  }

  const clientHash = await sha256(fromBase64url(input.clientDataJSON));
  const signedData = concat(authDataBytes, clientHash);
  let signature = fromBase64url(input.signature);

  const c = getCrypto();
  let verified: boolean;
  if (input.algorithm === "ES256") {
    const key = await c.subtle.importKey("jwk", input.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    signature = derToRaw(signature);
    verified = await c.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );
  } else {
    const key = await c.subtle.importKey("jwk", input.publicKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    verified = await c.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );
  }

  if (!verified) throw new Error("signature verification failed");
  return { verified: true, newCounter: authData.signCount, userVerified: authData.userVerified };
}

/* ------------------------------ browser helpers ------------------------------ */

/** True if the browser supports WebAuthn. */
export function isWebAuthnSupported(): boolean {
  return typeof (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential !== "undefined";
}

/** True if a platform authenticator (FaceID / fingerprint / Windows Hello) is available. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  const PKC = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } })
    .PublicKeyCredential;
  if (!PKC?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  return PKC.isUserVerifyingPlatformAuthenticatorAvailable();
}

/**
 * Run the browser registration ceremony. Pass the JSON from
 * {@link generateRegistrationOptions}; returns JSON (base64url) to POST back.
 */
export async function startRegistration(options: ReturnType<typeof generateRegistrationOptions>) {
  const publicKey = {
    ...options,
    challenge: fromBase64url(options.challenge),
    user: { ...options.user, id: fromBase64url(options.user.id) },
    excludeCredentials: options.excludeCredentials.map((c) => ({ ...c, id: fromBase64url(c.id) })),
  };
  const cred = (await (navigator as Navigator).credentials.create({ publicKey: publicKey as unknown as PublicKeyCredentialCreationOptions })) as PublicKeyCredential;
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toBase64url(cred.rawId),
    type: cred.type,
    clientDataJSON: toBase64url(res.clientDataJSON),
    attestationObject: toBase64url(res.attestationObject),
  };
}

/**
 * Run the browser authentication ceremony. Pass the JSON from
 * {@link generateAuthenticationOptions}; returns JSON (base64url) to POST back.
 */
export async function startAuthentication(options: ReturnType<typeof generateAuthenticationOptions>) {
  const publicKey = {
    ...options,
    challenge: fromBase64url(options.challenge),
    allowCredentials: options.allowCredentials.map((c) => ({ ...c, id: fromBase64url(c.id) })),
  };
  const cred = (await (navigator as Navigator).credentials.get({ publicKey: publicKey as unknown as PublicKeyCredentialRequestOptions })) as PublicKeyCredential;
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toBase64url(cred.rawId),
    type: cred.type,
    clientDataJSON: toBase64url(res.clientDataJSON),
    authenticatorData: toBase64url(res.authenticatorData),
    signature: toBase64url(res.signature),
    userHandle: res.userHandle ? toBase64url(res.userHandle) : null,
  };
}
