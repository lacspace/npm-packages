import { test, expect } from "vitest";
import { parseAuthenticatorFlags, formatAaguid } from "./flags";
import { readAuthenticatorData, toBase64url } from "./index";

// Flag bits: UP 0x01, UV 0x04, BE 0x08, BS 0x10, AT 0x40, ED 0x80.

test("parseAuthenticatorFlags decodes every bit", () => {
  const f = parseAuthenticatorFlags(0x01 | 0x04 | 0x08 | 0x10 | 0x40 | 0x80);
  expect(f).toEqual({
    userPresent: true,
    userVerified: true,
    backupEligible: true,
    backupState: true,
    attestedCredentialData: true,
    extensionData: true,
  });
});

test("parseAuthenticatorFlags with only UP set", () => {
  const f = parseAuthenticatorFlags(0x01);
  expect(f.userPresent).toBe(true);
  expect(f.userVerified).toBe(false);
  expect(f.backupEligible).toBe(false);
  expect(f.backupState).toBe(false);
});

test("parseAuthenticatorFlags separates backup-eligible from backup-state", () => {
  // A synced passkey that is eligible but not (yet) backed up: BE=1, BS=0.
  const f = parseAuthenticatorFlags(0x01 | 0x04 | 0x08);
  expect(f.backupEligible).toBe(true);
  expect(f.backupState).toBe(false);
});

test("formatAaguid formats 16 bytes as 8-4-4-4-12 hex", () => {
  const bytes = new Uint8Array([
    0xf8, 0xa0, 0x11, 0xf3, 0x8c, 0x0a, 0x4d, 0x15, 0x80, 0x06, 0x17, 0x11, 0x1f, 0x9e, 0xdc, 0x7d,
  ]);
  expect(formatAaguid(bytes)).toBe("f8a011f3-8c0a-4d15-8006-17111f9edc7d");
});

test("formatAaguid of all-zero AAGUID", () => {
  expect(formatAaguid(new Uint8Array(16))).toBe("00000000-0000-0000-0000-000000000000");
});

test("readAuthenticatorData parses an assertion buffer (no attested data)", () => {
  const bytes = new Uint8Array(37);
  bytes.set(new Uint8Array(32).fill(0xab), 0); // rpIdHash
  bytes[32] = 0x01 | 0x04 | 0x10; // UP + UV + BS
  bytes[36] = 9; // signCount = 9
  const info = readAuthenticatorData(bytes);
  expect(info.signCount).toBe(9);
  expect(info.flags.userPresent).toBe(true);
  expect(info.flags.userVerified).toBe(true);
  expect(info.flags.backupState).toBe(true);
  expect(info.flags.attestedCredentialData).toBe(false);
  expect(info.aaguid).toBeUndefined();
  expect(info.credentialId).toBeUndefined();
});

test("readAuthenticatorData accepts base64url and extracts AAGUID + credentialId", () => {
  const credId = new Uint8Array([1, 2, 3, 4, 5]);
  const bytes = new Uint8Array(55 + credId.length);
  bytes[32] = 0x01 | 0x40; // UP + AT
  bytes.set(new Uint8Array(16).fill(0x11), 37); // aaguid
  bytes[53] = 0x00;
  bytes[54] = credId.length; // credIdLen
  bytes.set(credId, 55);
  const info = readAuthenticatorData(toBase64url(bytes));
  expect(info.flags.attestedCredentialData).toBe(true);
  expect(info.aaguid).toBe("11111111-1111-1111-1111-111111111111");
  expect(info.credentialId).toBe(toBase64url(credId));
});
