import { test, expect } from "vitest";
import { keyuri, parseOtpauthUri } from "./index";

test("keyuri → parseOtpauthUri round-trips a TOTP URI", () => {
  const uri = keyuri({
    secret: "JBSWY3DPEHPK3PXP",
    label: "user@lacspace.com",
    issuer: "Lacspace",
    digits: 6,
    period: 30,
  });
  const p = parseOtpauthUri(uri);
  expect(p.type).toBe("totp");
  expect(p.secret).toBe("JBSWY3DPEHPK3PXP");
  expect(p.label).toBe("user@lacspace.com");
  expect(p.issuer).toBe("Lacspace");
  expect(p.algorithm).toBe("SHA-1");
  expect(p.digits).toBe(6);
  expect(p.period).toBe(30);
});

test("parses an HOTP URI with a counter", () => {
  const uri = keyuri({ secret: "JBSWY3DPEHPK3PXP", label: "a@b.com", type: "hotp", counter: 7 });
  const p = parseOtpauthUri(uri);
  expect(p.type).toBe("hotp");
  expect(p.counter).toBe(7);
  expect(p.period).toBeUndefined();
});

test("recovers the issuer from a label prefix even without an issuer param", () => {
  const p = parseOtpauthUri("otpauth://totp/Lacspace:user@lacspace.com?secret=JBSWY3DPEHPK3PXP");
  expect(p.issuer).toBe("Lacspace");
  expect(p.label).toBe("user@lacspace.com");
});

test("normalises SHA256 / SHA512 algorithm names", () => {
  expect(parseOtpauthUri("otpauth://totp/x?secret=AA&algorithm=SHA256").algorithm).toBe("SHA-256");
  expect(parseOtpauthUri("otpauth://totp/x?secret=AA&algorithm=SHA512").algorithm).toBe("SHA-512");
});

test("applies standard defaults when params are absent", () => {
  const p = parseOtpauthUri("otpauth://totp/x?secret=AA");
  expect(p.algorithm).toBe("SHA-1");
  expect(p.digits).toBe(6);
  expect(p.period).toBe(30);
});

test("honours custom digits/period from the URI", () => {
  const p = parseOtpauthUri("otpauth://totp/x?secret=AA&digits=8&period=60");
  expect(p.digits).toBe(8);
  expect(p.period).toBe(60);
});

test("throws on a non-otpauth string", () => {
  expect(() => parseOtpauthUri("https://example.com")).toThrow(/not an otpauth/);
});

test("throws when the secret is missing", () => {
  expect(() => parseOtpauthUri("otpauth://totp/x?issuer=Lacspace")).toThrow(/secret/);
});
