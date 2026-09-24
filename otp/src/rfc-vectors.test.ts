import { test, expect } from "vitest";
import { hotp, totp, base32Encode } from "./index";

const enc = new TextEncoder();
const b32 = (s: string) => base32Encode(enc.encode(s));

// RFC 4226 Appendix D — secret "12345678901234567890", counters 0–9.
test("HOTP matches the RFC 4226 test vectors", async () => {
  const want = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  for (let c = 0; c < 10; c++) expect(await hotp(b32("12345678901234567890"), c)).toBe(want[c]);
});

// RFC 6238 Appendix B — 8 digits, 30-second step, per-algorithm secrets.
test("TOTP matches the RFC 6238 test vectors for SHA-1, SHA-256 and SHA-512", async () => {
  const s1 = "12345678901234567890", s256 = "12345678901234567890123456789012";
  const s512 = "1234567890123456789012345678901234567890123456789012345678901234";
  const v: [number, "SHA-1" | "SHA-256" | "SHA-512", string, string][] = [
    [59, "SHA-1", s1, "94287082"], [1111111109, "SHA-1", s1, "07081804"], [1111111111, "SHA-1", s1, "14050471"],
    [1234567890, "SHA-1", s1, "89005924"], [2000000000, "SHA-1", s1, "69279037"], [20000000000, "SHA-1", s1, "65353130"],
    [59, "SHA-256", s256, "46119246"], [59, "SHA-512", s512, "90693936"],
  ];
  for (const [t, algorithm, secret, want] of v) {
    expect(await totp(b32(secret), { digits: 8, algorithm, timestamp: t * 1000 })).toBe(want);
  }
});

// The Key URI spec (and this package's own keyuri()) spell the algorithm
// without the dash. A JavaScript caller passing that used to get a raw Web
// Crypto "Unrecognized algorithm name".
test("algorithm names are accepted with or without the dash, in any case", async () => {
  const secret = b32("12345678901234567890"); const at = { timestamp: 1700000000000 };
  const ref = await totp(secret, { ...at, algorithm: "SHA-256" });
  for (const a of ["SHA256", "sha256", "Sha-256", " SHA-256 "]) expect(await totp(secret, { ...at, algorithm: a as never })).toBe(ref);
  expect(await totp(secret, { ...at, algorithm: "SHA1" as never })).toBe(await totp(secret, { ...at, algorithm: "SHA-1" }));
  await expect(totp(secret, { algorithm: "MD5" as never })).rejects.toThrow(/unsupported OTP algorithm/);
});
