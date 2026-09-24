import { test, expect } from "vitest";
import { sha256, hmac, hkdf, toHex, fromHex, fromBase64url, toBase64url } from "./index";

const hex = (x: string | Uint8Array) => (typeof x === "string" ? x : toHex(x));

test("SHA-256 known answers", async () => {
  expect(hex(await sha256("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(hex(await sha256(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("HMAC-SHA256 matches RFC 4231 test cases 1 and 2", async () => {
  expect(hex(await hmac(new Uint8Array(20).fill(0x0b), "Hi There"))).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  expect(hex(await hmac("Jefe", "what do ya want for nothing?"))).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

test("HKDF-SHA256 matches RFC 5869 test case 1", async () => {
  const okm = await hkdf(new Uint8Array(22).fill(0x0b), { salt: fromHex("000102030405060708090a0b0c"), info: fromHex("f0f1f2f3f4f5f6f7f8f9"), length: 42 });
  expect(hex(okm)).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
});

// base64url makes padding optional (RFC 4648 §5) and some encoders emit it.
// Re-padding an already-padded string produced an invalid length and threw a
// raw DOMException out of atob.
test("fromBase64url accepts every padding variant", () => {
  for (const s of ["-_-_", "-_-_=", "-_-_=="]) expect(toHex(fromBase64url(s))).toBe("fbffbf");
  for (const s of ["-_8", "-_8=", "-_8=="]) expect(toHex(fromBase64url(s))).toBe("fbff");
  for (const s of ["AQ", "AQ=", "AQ=="]) expect(toHex(fromBase64url(s))).toBe("01");
});

test("base64url round-trips every length", () => {
  for (let n = 0; n < 40; n++) { const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255); expect(toHex(fromBase64url(toBase64url(b)))).toBe(toHex(b)); }
});
