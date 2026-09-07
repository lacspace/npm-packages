import { test, expect } from "vitest";
import { base32Encode, base32Decode, totp, verifyTotp, generateSecret } from "./index";

function secretFromAscii(seed: string): string {
  return base32Encode(new TextEncoder().encode(seed));
}

// RFC 6238 Appendix B reference vectors at T = 59s (step 30 → counter 1), 8 digits.
test("RFC 6238 SHA-256 vector (8 digits @ t=59)", async () => {
  const secret = secretFromAscii("12345678901234567890123456789012"); // 32-byte seed
  const code = await totp(secret, { timestamp: 59_000, digits: 8, algorithm: "SHA-256", window: 0 } as never);
  expect(code).toBe("46119246");
});

test("RFC 6238 SHA-512 vector (8 digits @ t=59)", async () => {
  const secret = secretFromAscii("1234567890123456789012345678901234567890123456789012345678901234"); // 64-byte seed
  const code = await totp(secret, { timestamp: 59_000, digits: 8, algorithm: "SHA-512", window: 0 } as never);
  expect(code).toBe("90693936");
});

test("SHA-256 generate → verify round-trip reports offset 0", async () => {
  const secret = generateSecret(32);
  const t = 1_700_000_000_000;
  const code = await totp(secret, { timestamp: t, algorithm: "SHA-256" });
  expect(await verifyTotp(code, secret, { timestamp: t, algorithm: "SHA-256" })).toBe(0);
});

test("7-digit codes are supported and round-trip", async () => {
  const secret = generateSecret();
  const t = 1_700_000_000_000;
  const code = await totp(secret, { timestamp: t, digits: 7 });
  expect(code).toHaveLength(7);
  expect(await verifyTotp(code, secret, { timestamp: t, digits: 7 })).toBe(0);
});

test("window verification reports which step matched (drift)", async () => {
  const secret = generateSecret();
  const t = 1_700_000_000_000;
  const code = await totp(secret, { timestamp: t });
  // Code from 2 steps ago, verified now with a ±2 window → offset -2.
  const later = t + 2 * 30_000;
  expect(await verifyTotp(code, secret, { timestamp: later, window: 2 })).toBe(-2);
  // Same code with the default ±1 window → out of range.
  expect(await verifyTotp(code, secret, { timestamp: later })).toBeNull();
});

test("base32 encode/decode round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 42, 7, 128, 64]);
  expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  // padding + whitespace tolerated on decode
  expect(base32Decode("JBSW Y3DP")).toEqual(base32Decode("JBSWY3DP"));
});
