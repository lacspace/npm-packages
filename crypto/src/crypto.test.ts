import { test, expect } from "vitest";
import {
  encrypt,
  decrypt,
  decryptBytes,
  generateKey,
  hmac,
  hmacVerify,
  constantTimeEqual,
  encryptWithPassword,
  decryptWithPassword,
  toHex,
  fromHex,
  randomBytes,
} from "./index";

test("encrypt → decrypt roundtrip (no AAD)", async () => {
  const key = generateKey();
  const blob = await encrypt("hello world", key);
  expect(blob.startsWith("v1:")).toBe(true);
  expect(await decrypt(blob, key)).toBe("hello world");
});

test("encrypt → decrypt roundtrip with AAD; wrong AAD fails", async () => {
  const key = generateKey();
  const blob = await encrypt("secret", key, { aad: "tenant-42" });
  expect(await decrypt(blob, key, { aad: "tenant-42" })).toBe("secret");
  await expect(decrypt(blob, key, { aad: "tenant-99" })).rejects.toThrow();
  await expect(decrypt(blob, key)).rejects.toThrow();
});

test("wrong key cannot decrypt", async () => {
  const blob = await encrypt("data", generateKey());
  await expect(decrypt(blob, generateKey())).rejects.toThrow();
});

test("hmac sign / verify", async () => {
  const sig = await hmac("key", "message");
  expect(await hmacVerify("key", "message", sig)).toBe(true);
  expect(await hmacVerify("key", "tampered", sig)).toBe(false);
  expect(await hmacVerify("wrong", "message", sig)).toBe(false);
});

test("constantTimeEqual true / false", () => {
  expect(constantTimeEqual("abc", "abc")).toBe(true);
  expect(constantTimeEqual("abc", "abd")).toBe(false);
  expect(constantTimeEqual("abc", "abcd")).toBe(false);
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
});

test("encryptWithPassword → decryptWithPassword; wrong password fails", async () => {
  const blob = await encryptWithPassword("top secret", "hunter2", { iterations: 1000 });
  expect(blob.startsWith("v1p:")).toBe(true);
  expect(await decryptWithPassword(blob, "hunter2")).toBe("top secret");
  await expect(decryptWithPassword(blob, "wrong")).rejects.toThrow();
});

test("hex round-trip", () => {
  const bytes = randomBytes(32);
  expect(fromHex(toHex(bytes))).toEqual(bytes);
  expect(toHex(new Uint8Array([0, 255, 16]))).toBe("00ff10");
});

test("decryptBytes is binary-safe", async () => {
  const key = generateKey();
  const raw = new Uint8Array([0, 1, 2, 250, 255]);
  const blob = await encrypt(raw, key);
  expect(await decryptBytes(blob, key)).toEqual(raw);
});
