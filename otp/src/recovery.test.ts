import { test, expect } from "vitest";
import { generateRecoveryCodes, verifyRecoveryCode } from "./index";

test("generates the default count with the expected shape and unique codes", async () => {
  const { codes, hashes } = await generateRecoveryCodes();
  expect(codes).toHaveLength(10);
  expect(hashes).toHaveLength(10);
  for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  // Cryptographically random → all distinct.
  expect(new Set(codes).size).toBe(10);
  // Hashes are SHA-256 hex, never the plaintext.
  for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(hashes.some((h) => codes.includes(h))).toBe(false);
});

test("honours count / groups / groupLength / separator", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 4, groups: 3, groupLength: 4, separator: "_" });
  expect(codes).toHaveLength(4);
  expect(hashes).toHaveLength(4);
  for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{4}_[A-Z0-9]{4}_[A-Z0-9]{4}$/);
});

test("numeric and hex formats", async () => {
  const num = await generateRecoveryCodes({ count: 3, format: "numeric", groups: 1, groupLength: 8 });
  for (const c of num.codes) expect(c).toMatch(/^[0-9]{8}$/);
  const hex = await generateRecoveryCodes({ count: 3, format: "hex", groups: 1, groupLength: 8 });
  for (const c of hex.codes) expect(c).toMatch(/^[0-9A-F]{8}$/);
});

test("two calls produce different sets (fresh randomness)", async () => {
  const a = await generateRecoveryCodes({ count: 8 });
  const b = await generateRecoveryCodes({ count: 8 });
  expect(a.codes).not.toEqual(b.codes);
});

test("verify consumes a code and returns the remaining hashes", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 5 });
  const res = await verifyRecoveryCode(codes[2]!, hashes);
  expect(res.ok).toBe(true);
  expect(res.index).toBe(2);
  expect(res.remaining).toHaveLength(4);
  expect(res.remaining).not.toContain(hashes[2]);
});

test("verify is case- and separator-insensitive", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 3 });
  const messy = codes[0]!.toLowerCase().replace(/-/g, " ");
  const res = await verifyRecoveryCode(messy, hashes);
  expect(res.ok).toBe(true);
  expect(res.index).toBe(0);
});

test("a wrong code does not match and leaves the set untouched", async () => {
  const { hashes } = await generateRecoveryCodes({ count: 3 });
  const res = await verifyRecoveryCode("ZZZZZ-ZZZZZ", hashes);
  expect(res.ok).toBe(false);
  expect(res.index).toBe(-1);
  expect(res.remaining).toBe(hashes);
});

test("single-use: a consumed code no longer verifies against the remaining set", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 4 });
  const first = await verifyRecoveryCode(codes[1]!, hashes);
  expect(first.ok).toBe(true);
  const again = await verifyRecoveryCode(codes[1]!, first.remaining);
  expect(again.ok).toBe(false);
  expect(again.remaining).toHaveLength(3);
});
