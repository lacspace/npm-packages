import { test, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { verifyAuthentication } from "./index";

// A genuine ES256 assertion built the way an authenticator builds one, so the
// verifier is exercised end to end rather than with canned base64.
const sub = webcrypto.subtle; const enc = new TextEncoder();
const b64u = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("base64url");
const sha = async (d: Uint8Array | string) => new Uint8Array(await sub.digest("SHA-256", typeof d === "string" ? enc.encode(d) : d));
const der = (sig: Uint8Array) => { const int = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0]! & 0x80) b = Uint8Array.from([0, ...b]); return Uint8Array.from([2, b.length, ...b]); }; const r = int(sig.slice(0, 32)), s = int(sig.slice(32)); return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]); };

async function fixture(o: { flags?: number; counter?: number; origin?: string; type?: string; rpId?: string; flipSig?: boolean } = {}) {
  const kp = await sub.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await sub.exportKey("jwk", kp.publicKey);
  const CH = b64u(webcrypto.getRandomValues(new Uint8Array(32)));
  const ad = new Uint8Array(37); ad.set(await sha(o.rpId ?? "example.com"), 0); ad[32] = o.flags ?? 0x05; new DataView(ad.buffer).setUint32(33, o.counter ?? 10);
  const cdj = enc.encode(JSON.stringify({ type: o.type ?? "webauthn.get", challenge: CH, origin: o.origin ?? "https://example.com", crossOrigin: false }));
  const sig = der(new Uint8Array(await sub.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new Uint8Array([...ad, ...(await sha(cdj))]))));
  if (o.flipSig) sig[sig.length - 1]! ^= 1;
  return { authenticatorData: b64u(ad), clientDataJSON: b64u(cdj), signature: b64u(sig), publicKey: jwk as JsonWebKey, algorithm: "ES256" as const, expectedChallenge: CH, expectedOrigin: "https://example.com", expectedRPID: "example.com", counter: 5 };
}
const verified = (p: Promise<{ verified: boolean }>) => p.then((r) => r.verified, () => false);

test("a genuine assertion verifies and reports the new counter", async () => {
  const r = await verifyAuthentication(await fixture());
  expect(r.verified).toBe(true); expect(r.newCounter).toBe(10); expect(r.userVerified).toBe(true);
});

// expectedOrigin is developer config and routinely arrives from an APP_URL with
// a trailing slash or capitalised host; a strict `!==` rejected every sign-in.
test("expectedOrigin is normalised: trailing slash, case and default port", async () => {
  const f = await fixture();
  for (const o of ["https://example.com/", "HTTPS://EXAMPLE.COM", "https://example.com:443"]) expect(await verified(verifyAuthentication({ ...f, expectedOrigin: o })), o).toBe(true);
});

test("normalisation never over-matches", async () => {
  const f = await fixture();
  for (const o of ["https://evil.com", "http://example.com", "https://example.com.evil.com", "https://sub.example.com"]) expect(await verified(verifyAuthentication({ ...f, expectedOrigin: o })), o).toBe(false);
});

test("every attack variant is rejected", async () => {
  expect(await verified(verifyAuthentication(await fixture({ origin: "https://evil.com" })))).toBe(false);
  expect(await verified(verifyAuthentication(await fixture({ type: "webauthn.create" })))).toBe(false);
  expect(await verified(verifyAuthentication(await fixture({ rpId: "other.com" })))).toBe(false);
  expect(await verified(verifyAuthentication(await fixture({ flipSig: true })))).toBe(false);
  expect(await verified(verifyAuthentication({ ...(await fixture({ counter: 10 })), counter: 20 }))).toBe(false); // rollback
  expect(await verified(verifyAuthentication({ ...(await fixture({ counter: 5 })), counter: 5 }))).toBe(false); // replay
  expect(await verified(verifyAuthentication({ ...(await fixture({ flags: 0x01 })), requireUserVerification: true }))).toBe(false);
  expect(await verified(verifyAuthentication(await fixture({ flags: 0x04 })))).toBe(false); // no user presence
  expect(await verified(verifyAuthentication({ ...(await fixture()), algorithm: "RS256" }))).toBe(false);
});
