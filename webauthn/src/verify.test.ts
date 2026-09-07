import { test, expect } from "vitest";
import {
  verifyRegistration,
  verifyAuthentication,
  generateRegistrationOptions,
  generateAuthenticationOptions,
  generateChallenge,
  toBase64url,
  fromBase64url,
  formatAaguid,
} from "./index";

/**
 * These tests build attestation / assertion fixtures deterministically with Web
 * Crypto (a real ECDSA-P256 and Ed25519 key pair, a minimal CBOR encoder, and
 * hand-assembled authenticatorData) — no browser or hardware authenticator is
 * required. They exercise the full server verifiers end-to-end.
 */

const webcrypto = globalThis.crypto;
const RP_ID = "lacspace.com";
const ORIGIN = "https://lacspace.com";

// Flag bits.
const UP = 0x01;
const UV = 0x04;
const BE = 0x08;
const BS = 0x10;
const AT = 0x40;

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await webcrypto.subtle.digest("SHA-256", data as unknown as BufferSource));
}

/* --- minimal CBOR encoder (uint / negint / bytes / text / array / map) --- */
function head(major: number, len: number): Uint8Array {
  if (len < 24) return new Uint8Array([(major << 5) | len]);
  if (len < 256) return new Uint8Array([(major << 5) | 24, len]);
  return new Uint8Array([(major << 5) | 25, (len >> 8) & 0xff, len & 0xff]);
}
type CborV = number | Uint8Array | string | CborV[] | Map<number | string, CborV>;
function cbor(v: CborV): Uint8Array {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (v instanceof Uint8Array) return concat(head(2, v.length), v);
  if (typeof v === "string") {
    const b = new TextEncoder().encode(v);
    return concat(head(3, b.length), b);
  }
  if (Array.isArray(v)) {
    let out = head(4, v.length);
    for (const it of v) out = concat(out, cbor(it));
    return out;
  }
  if (v instanceof Map) {
    let out = head(5, v.size);
    for (const [k, val] of v) out = concat(out, cbor(k), cbor(val));
    return out;
  }
  throw new Error("cbor: unsupported");
}

function coseEC(jwk: JsonWebKey): Map<number, CborV> {
  return new Map<number, CborV>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, fromBase64url(jwk.x!)],
    [-3, fromBase64url(jwk.y!)],
  ]);
}
function coseOKP(jwk: JsonWebKey): Map<number, CborV> {
  return new Map<number, CborV>([
    [1, 1],
    [3, -8],
    [-1, 6],
    [-2, fromBase64url(jwk.x!)],
  ]);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

async function assertionAuthData(flags: number, signCount: number): Promise<Uint8Array> {
  return concat(await sha256(new TextEncoder().encode(RP_ID)), new Uint8Array([flags]), u32(signCount));
}

async function attestedAuthData(
  flags: number,
  signCount: number,
  aaguid: Uint8Array,
  credId: Uint8Array,
  coseKey: Map<number, CborV>,
): Promise<Uint8Array> {
  return concat(
    await sha256(new TextEncoder().encode(RP_ID)),
    new Uint8Array([flags]),
    u32(signCount),
    aaguid,
    new Uint8Array([(credId.length >> 8) & 0xff, credId.length & 0xff]),
    credId,
    cbor(coseKey),
  );
}

function attestationObject(authData: Uint8Array): Uint8Array {
  return cbor(
    new Map<string, CborV>([
      ["fmt", "none"],
      ["attStmt", new Map<number | string, CborV>()],
      ["authData", authData],
    ]),
  );
}

function clientDataJSON(type: string, challenge: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));
}

/** ECDSA raw (P1363) signature → DER, matching what a real authenticator emits. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const enc = (x: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    const trimmed = x.slice(i);
    const b = trimmed[0]! & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
    return concat(new Uint8Array([0x02, b.length]), b);
  };
  const body = concat(enc(raw.slice(0, 32)), enc(raw.slice(32, 64)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

/* ----------------------------- authentication ----------------------------- */

test("verifyAuthentication verifies an ES256 assertion and surfaces flags", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await assertionAuthData(UP | UV | BE | BS, 10);
  const cdata = clientDataJSON("webauthn.get", challenge);
  const signed = concat(authData, await sha256(cdata));
  const raw = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, signed as unknown as BufferSource));

  const res = await verifyAuthentication({
    authenticatorData: toBase64url(authData),
    clientDataJSON: toBase64url(cdata),
    signature: toBase64url(rawToDer(raw)),
    publicKey: jwk,
    algorithm: "ES256",
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    counter: 5,
  });
  expect(res.verified).toBe(true);
  expect(res.newCounter).toBe(10);
  expect(res.userPresent).toBe(true);
  expect(res.userVerified).toBe(true);
  expect(res.backupEligible).toBe(true);
  expect(res.backupState).toBe(true);
});

test("verifyAuthentication verifies an Ed25519 assertion", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await assertionAuthData(UP | UV, 3);
  const cdata = clientDataJSON("webauthn.get", challenge);
  const signed = concat(authData, await sha256(cdata));
  const sig = new Uint8Array(await webcrypto.subtle.sign({ name: "Ed25519" }, kp.privateKey, signed as unknown as BufferSource));

  const res = await verifyAuthentication({
    authenticatorData: toBase64url(authData),
    clientDataJSON: toBase64url(cdata),
    signature: toBase64url(sig),
    publicKey: jwk,
    algorithm: "Ed25519",
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  expect(res.verified).toBe(true);
  expect(res.userVerified).toBe(true);
  expect(res.backupEligible).toBe(false);
});

test("verifyAuthentication rejects when UV required but UV flag is 0", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await assertionAuthData(UP, 2); // UP only, no UV
  const cdata = clientDataJSON("webauthn.get", challenge);
  const signed = concat(authData, await sha256(cdata));
  const raw = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, signed as unknown as BufferSource));

  await expect(
    verifyAuthentication({
      authenticatorData: toBase64url(authData),
      clientDataJSON: toBase64url(cdata),
      signature: toBase64url(rawToDer(raw)),
      publicKey: jwk,
      algorithm: "ES256",
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    }),
  ).rejects.toThrow(/user verification required/);
});

test("verifyAuthentication rejects a regressed sign counter (clone detection)", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await assertionAuthData(UP | UV, 3); // counter went backwards
  const cdata = clientDataJSON("webauthn.get", challenge);
  const signed = concat(authData, await sha256(cdata));
  const raw = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, signed as unknown as BufferSource));

  await expect(
    verifyAuthentication({
      authenticatorData: toBase64url(authData),
      clientDataJSON: toBase64url(cdata),
      signature: toBase64url(rawToDer(raw)),
      publicKey: jwk,
      algorithm: "ES256",
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      counter: 5,
    }),
  ).rejects.toThrow(/sign counter/);
});

test("verifyAuthentication rejects a non-increasing (equal) counter", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await assertionAuthData(UP | UV, 5);
  const cdata = clientDataJSON("webauthn.get", challenge);
  const signed = concat(authData, await sha256(cdata));
  const raw = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, signed as unknown as BufferSource));

  await expect(
    verifyAuthentication({
      authenticatorData: toBase64url(authData),
      clientDataJSON: toBase64url(cdata),
      signature: toBase64url(rawToDer(raw)),
      publicKey: jwk,
      algorithm: "ES256",
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      counter: 5,
    }),
  ).rejects.toThrow(/sign counter/);
});

test("verifyAuthentication rejects a tampered signature", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await assertionAuthData(UP | UV, 1);
  const cdata = clientDataJSON("webauthn.get", challenge);
  const signed = concat(authData, await sha256(cdata));
  const sig = new Uint8Array(await webcrypto.subtle.sign({ name: "Ed25519" }, kp.privateKey, signed as unknown as BufferSource));
  sig[0] = sig[0]! ^ 0xff; // flip a byte

  await expect(
    verifyAuthentication({
      authenticatorData: toBase64url(authData),
      clientDataJSON: toBase64url(cdata),
      signature: toBase64url(sig),
      publicKey: jwk,
      algorithm: "Ed25519",
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    }),
  ).rejects.toThrow(/signature verification failed/);
});

/* ------------------------------ registration ------------------------------ */

test("verifyRegistration extracts an ES256 key, flags (BE/BS/UV/UP), AAGUID and echoes transports", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const aaguid = new Uint8Array(16).fill(0xab);
  const credId = webcrypto.getRandomValues(new Uint8Array(16));
  const authData = await attestedAuthData(UP | UV | BE | BS | AT, 0, aaguid, credId, coseEC(jwk));

  const res = await verifyRegistration({
    attestationObject: toBase64url(attestationObject(authData)),
    clientDataJSON: toBase64url(clientDataJSON("webauthn.create", challenge)),
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    transports: ["internal", "hybrid"],
  });
  expect(res.verified).toBe(true);
  expect(res.algorithm).toBe("ES256");
  expect(res.credentialId).toBe(toBase64url(credId));
  expect(res.userPresent).toBe(true);
  expect(res.userVerified).toBe(true);
  expect(res.backupEligible).toBe(true);
  expect(res.backupState).toBe(true);
  expect(res.aaguid).toBe(formatAaguid(aaguid));
  expect(res.transports).toEqual(["internal", "hybrid"]);
  expect(res.publicKey.kty).toBe("EC");
  expect(res.publicKey.x).toBe(jwk.x);
});

test("verifyRegistration extracts an Ed25519 (OKP) key", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const credId = webcrypto.getRandomValues(new Uint8Array(16));
  const authData = await attestedAuthData(UP | UV | AT, 0, new Uint8Array(16), credId, coseOKP(jwk));

  const res = await verifyRegistration({
    attestationObject: toBase64url(attestationObject(authData)),
    clientDataJSON: toBase64url(clientDataJSON("webauthn.create", challenge)),
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  expect(res.algorithm).toBe("Ed25519");
  expect(res.publicKey.kty).toBe("OKP");
  expect(res.publicKey.crv).toBe("Ed25519");
  expect(res.publicKey.x).toBe(jwk.x);
  expect(res.backupEligible).toBe(false);
  expect(res.aaguid).toBe("00000000-0000-0000-0000-000000000000");
});

test("verifyRegistration rejects when UV required but UV flag is 0", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await attestedAuthData(UP | AT, 0, new Uint8Array(16), webcrypto.getRandomValues(new Uint8Array(16)), coseEC(jwk));

  await expect(
    verifyRegistration({
      attestationObject: toBase64url(attestationObject(authData)),
      clientDataJSON: toBase64url(clientDataJSON("webauthn.create", challenge)),
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    }),
  ).rejects.toThrow(/user verification required/);
});

test("verifyRegistration enforces requireResidentKey via credProps", async () => {
  const challenge = generateChallenge();
  const kp = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const authData = await attestedAuthData(UP | UV | AT, 0, new Uint8Array(16), webcrypto.getRandomValues(new Uint8Array(16)), coseEC(jwk));
  const base = {
    attestationObject: toBase64url(attestationObject(authData)),
    clientDataJSON: toBase64url(clientDataJSON("webauthn.create", challenge)),
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireResidentKey: true,
  };
  // no residentKey signal → reject
  await expect(verifyRegistration(base)).rejects.toThrow(/resident\/discoverable key required/);
  // credProps.rk === true → pass
  const ok = await verifyRegistration({ ...base, residentKey: true });
  expect(ok.verified).toBe(true);
});

/* ------------------------- options: transports/policy ------------------------- */

test("generateAuthenticationOptions echoes transports from credential descriptors", () => {
  const opts = generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: [{ id: "abc", transports: ["usb", "nfc"] }, "plain-id"],
  });
  expect(opts.allowCredentials[0]).toEqual({ type: "public-key", id: "abc", transports: ["usb", "nfc"] });
  expect(opts.allowCredentials[1]).toEqual({ type: "public-key", id: "plain-id" });
});

test("generateRegistrationOptions supports residentKey/attestation and descriptor excludeCredentials", () => {
  const opts = generateRegistrationOptions({
    rpName: "Lacspace",
    rpID: RP_ID,
    userID: "u",
    userName: "n",
    residentKey: "required",
    attestation: "direct",
    excludeCredentials: [{ id: "x", transports: ["ble"] }],
  });
  expect(opts.attestation).toBe("direct");
  expect(opts.authenticatorSelection.residentKey).toBe("required");
  expect(opts.excludeCredentials[0]).toEqual({ type: "public-key", id: "x", transports: ["ble"] });

  // Defaults unchanged when the new options are omitted (backward compatible).
  const d = generateRegistrationOptions({ rpName: "Lacspace", rpID: RP_ID, userID: "u", userName: "n" });
  expect(d.attestation).toBe("none");
  expect(d.authenticatorSelection.residentKey).toBe("preferred");
});
