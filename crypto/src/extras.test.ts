import { test, expect } from "vitest";
import {
  timingSafeEqual,
  constantTimeEqual,
  sha384,
  sha512,
  sha256,
  hmac,
  hmacHex,
  hmacBase64url,
  toBase64,
  fromBase64,
  toBase64url,
  fromBase64url,
  toHex,
  randomString,
  randomUUID,
  randomInt,
  DEFAULT_RANDOM_ALPHABET,
} from "./index";

test("timingSafeEqual is constantTimeEqual and behaves the same", () => {
  expect(timingSafeEqual).toBe(constantTimeEqual);
  expect(timingSafeEqual("abc", "abc")).toBe(true);
  expect(timingSafeEqual("abc", "abd")).toBe(false);
  expect(timingSafeEqual("abc", "abcd")).toBe(false);
  expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
});

test("sha384 known vector (empty string)", async () => {
  // FIPS 180-4 known answer for SHA-384("")
  expect(await sha384("")).toBe(
    "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b",
  );
});

test("sha512 known vector (\"abc\")", async () => {
  // FIPS 180-4 known answer for SHA-512("abc")
  expect(await sha512("abc")).toBe(
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
      "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  );
});

test("sha256 still returns hex and matches known vector", async () => {
  expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hmacHex matches RFC-4231 test case (SHA-256)", async () => {
  // RFC 4231 test case 1: key=0x0b*20, data="Hi There"
  const key = new Uint8Array(20).fill(0x0b);
  expect(await hmacHex(key, "Hi There")).toBe(
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  );
});

test("hmacHex / hmacBase64url encode the same signature as hmac()", async () => {
  const sig = await hmac("k", "msg");
  expect(await hmacHex("k", "msg")).toBe(toHex(sig));
  expect(await hmacBase64url("k", "msg")).toBe(toBase64url(sig));
});

test("hmacHex respects the hash algorithm option", async () => {
  const a = await hmacHex("k", "msg", "SHA-256");
  const b = await hmacHex("k", "msg", "SHA-512");
  expect(a).not.toBe(b);
  expect(b.length).toBe(128); // 64 bytes -> 128 hex chars
});

test("toBase64 known value and round-trip", () => {
  expect(toBase64(new Uint8Array([104, 101, 108, 108, 111]))).toBe("aGVsbG8=");
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
  expect(fromBase64(toBase64(bytes))).toEqual(bytes);
});

test("fromBase64 tolerates base64url input", () => {
  const bytes = new Uint8Array([251, 255, 190, 239]);
  const url = toBase64url(bytes); // no padding, - and _
  expect(fromBase64(url)).toEqual(bytes);
  expect(fromBase64url(toBase64url(bytes))).toEqual(bytes);
});

test("randomString has requested length and default alphabet", () => {
  const s = randomString(64);
  expect(s.length).toBe(64);
  for (const ch of s) expect(DEFAULT_RANDOM_ALPHABET.includes(ch)).toBe(true);
  expect(randomString(0)).toBe("");
});

test("randomString honours a custom alphabet", () => {
  const s = randomString(200, "01");
  expect(s.length).toBe(200);
  expect(/^[01]+$/.test(s)).toBe(true);
});

test("randomString produces distinct values (no obvious repeats)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) seen.add(randomString(24));
  expect(seen.size).toBe(50);
});

test("randomString rejects invalid arguments", () => {
  expect(() => randomString(-1)).toThrow();
  expect(() => randomString(4, "x")).toThrow();
});

test("randomUUID is a valid v4 UUID", () => {
  const u = randomUUID();
  expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(randomUUID()).not.toBe(randomUUID());
});

test("randomInt stays within range and covers bounds", () => {
  for (let i = 0; i < 1000; i++) {
    const v = randomInt(10);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(10);
    expect(Number.isInteger(v)).toBe(true);
  }
  const min = 100;
  const max = 105;
  const hits = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const v = randomInt(min, max);
    expect(v).toBeGreaterThanOrEqual(min);
    expect(v).toBeLessThan(max);
    hits.add(v);
  }
  expect(hits.size).toBe(max - min); // all 5 values observed
});

test("randomInt validates bounds", () => {
  expect(() => randomInt(5, 5)).toThrow();
  expect(() => randomInt(5, 1)).toThrow();
  expect(() => randomInt(1.5)).toThrow();
  expect(() => randomInt(0, 2 ** 49)).toThrow();
});

test("randomInt handles large-but-valid ranges", () => {
  const v = randomInt(1_000_000, 2_000_000);
  expect(v).toBeGreaterThanOrEqual(1_000_000);
  expect(v).toBeLessThan(2_000_000);
});
