import { test, expect } from "vitest";
import {
  generateChallenge,
  generateRegistrationOptions,
  generateAuthenticationOptions,
  toBase64url,
  fromBase64url,
} from "./index";

// NOTE: Full ceremony verification (verifyRegistration / verifyAuthentication)
// requires real authenticator fixtures (attestationObject, signatures, COSE
// keys). Those cannot be produced deterministically without a real/virtual
// authenticator, so they are out of scope for this unit suite. UV *enforcement*
// (`requireUserVerification`) is exercised indirectly: we assert the option is
// accepted and threaded into the options builders below.

test("generateChallenge produces a base64url challenge", () => {
  const c = generateChallenge();
  expect(typeof c).toBe("string");
  expect(c.length).toBeGreaterThan(20);
  expect(c).not.toMatch(/[+/=]/); // base64url alphabet
  expect(generateChallenge()).not.toBe(c); // random
});

test("base64url round-trip", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
  expect(fromBase64url(toBase64url(bytes))).toEqual(bytes);
});

test("generateRegistrationOptions produces a challenge and threads options", () => {
  const opts = generateRegistrationOptions({
    rpName: "Lacspace",
    rpID: "lacspace.com",
    userID: "user-1",
    userName: "user@lacspace.com",
    userVerification: "required",
  });
  expect(typeof opts.challenge).toBe("string");
  expect(opts.challenge.length).toBeGreaterThan(20);
  expect(opts.rp).toEqual({ name: "Lacspace", id: "lacspace.com" });
  // requireUserVerification is accepted and carried into authenticatorSelection.
  expect(opts.authenticatorSelection.userVerification).toBe("required");
  expect(opts.pubKeyCredParams.map((p) => p.alg)).toEqual([-7, -257]);
});

test("generateAuthenticationOptions produces a challenge and accepts UV option", () => {
  const opts = generateAuthenticationOptions({ rpID: "lacspace.com", userVerification: "required" });
  expect(typeof opts.challenge).toBe("string");
  expect(opts.challenge.length).toBeGreaterThan(20);
  expect(opts.rpId).toBe("lacspace.com");
  expect(opts.userVerification).toBe("required");
});

test("a provided challenge is used verbatim", () => {
  const ch = generateChallenge();
  expect(generateRegistrationOptions({ rpName: "L", rpID: "l.com", userID: "u", userName: "n", challenge: ch }).challenge).toBe(ch);
  expect(generateAuthenticationOptions({ rpID: "l.com", challenge: ch }).challenge).toBe(ch);
});
