import { test, expect } from "vitest";
import {
  generateSecret,
  totp,
  verifyTotp,
  generateBackupCodes,
  verifyBackupCode,
} from "./index";

// A fixed instant so TOTP is deterministic.
const T = 1_700_000_000_000;

test("TOTP generate → verify within window", async () => {
  const secret = generateSecret();
  const code = await totp(secret, { timestamp: T });
  expect(code).toHaveLength(6);
  expect(await verifyTotp(code, secret, { timestamp: T })).toBe(0);
  // One period earlier still accepted with default ±1 window.
  expect(await verifyTotp(code, secret, { timestamp: T + 30_000 })).toBe(-1);
});

test("verify fails outside the window", async () => {
  const secret = generateSecret();
  const code = await totp(secret, { timestamp: T });
  // 10 periods away, window 1 → no match.
  expect(await verifyTotp(code, secret, { timestamp: T + 300_000 })).toBeNull();
  expect(await verifyTotp("000000", secret, { timestamp: T })).toBeNull();
});

test("RFC 6238 SHA-1 test vector (8 digits @ t=59)", async () => {
  // RFC 6238 seed = ASCII "12345678901234567890" → base32 below.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const code = await totp(secret, { timestamp: 59_000, digits: 8, algorithm: "SHA-1", window: 0 } as never);
  expect(code).toBe("94287082");
});

test("backup codes generate → verify; reuse rejected once removed", async () => {
  const { codes, hashes } = await generateBackupCodes(5);
  expect(codes).toHaveLength(5);
  expect(hashes).toHaveLength(5);

  const idx = await verifyBackupCode(codes[2]!, hashes);
  expect(idx).toBe(2);

  // A wrong code does not match.
  expect(await verifyBackupCode("WRONG-CODES", hashes)).toBe(-1);

  // Single-use: caller removes the used hash → the same code no longer verifies.
  const remaining = hashes.filter((_, i) => i !== idx);
  expect(await verifyBackupCode(codes[2]!, remaining)).toBe(-1);
});
