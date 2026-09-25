import { test, expect } from "vitest";
import { isValidEmail, isValidEmailRFC5322, validateEmail, normalizeEmail, isFreeProvider, toAsciiDomain } from "./index";

// Trimming spaces is a convenience; a CR, LF or NUL is never part of an
// address, and a trailing one carried into a mail header starts an injection.
test("control characters are rejected, not trimmed away", () => {
  for (const e of ["user@example.com\n", "user@example.com\r\n", "\nuser@example.com", "user@example.com\u0000", "user\t@example.com"]) {
    expect(isValidEmail(e)).toBe(false);
    expect(isValidEmailRFC5322(e)).toBe(false);
  }
  expect(validateEmail("user@example.com\r\n").reason).toBe("control characters");
  expect(isValidEmail("  user@example.com  ")).toBe(true);
});

test("Unicode domains are valid and match their punycode form", () => {
  expect(isValidEmail("user@bücher.example")).toBe(true);
  expect(isValidEmail("user@例え.テスト")).toBe(true);
  expect(isValidEmail("user@münchen.de")).toBe(true);
  expect(isValidEmailRFC5322("user@bücher.example")).toBe(true);
  expect(toAsciiDomain("Bücher.Example")).toBe("xn--bcher-kva.example");
  expect(normalizeEmail("User@Bücher.Example")).toBe(normalizeEmail("user@xn--bcher-kva.example"));
  expect(isValidEmail("user@bü cher.example")).toBe(false);
  expect(isValidEmail("user@bücher.example/x")).toBe(false);
  expect(isValidEmail("user@-bücher.example")).toBe(false);
});

test("internationalised local parts are opt-in (RFC 6531)", () => {
  expect(isValidEmail("müller@example.com")).toBe(false);
  expect(isValidEmail("müller@example.com", { allowUnicodeLocal: true })).toBe(true);
  expect(isValidEmail("用户@例え.テスト", { allowUnicodeLocal: true })).toBe(true);
  expect(isValidEmail("अजय@डाटामेल.भारत", { allowUnicodeLocal: true })).toBe(true);
  expect(validateEmail("josé@example.com", { allowUnicodeLocal: true }).valid).toBe(true);
  expect(isValidEmail("mü..ller@example.com", { allowUnicodeLocal: true })).toBe(false);
  // 64 is an octet limit: 33 two-byte letters is 66 octets.
  expect(isValidEmail("ü".repeat(33) + "@example.com", { allowUnicodeLocal: true })).toBe(false);
  expect(isValidEmail("ü".repeat(32) + "@example.com", { allowUnicodeLocal: true })).toBe(true);
});

test("free providers include the big non-US ones", () => {
  for (const d of ["qq.com", "163.com", "126.com", "naver.com", "daum.net", "gmx.de", "web.de", "t-online.de", "orange.fr", "libero.it", "seznam.cz", "wp.pl", "yahoo.co.jp", "uol.com.br", "pm.me", "hey.com"]) {
    expect([d, isFreeProvider(d)]).toEqual([d, true]);
  }
  expect(isFreeProvider("lacspace.com")).toBe(false);
});

test("existing ASCII behaviour is unchanged", () => {
  expect(isValidEmail("user+tag@example.com")).toBe(true);
  expect(isValidEmail("user@xn--bcher-kva.example")).toBe(true);
  expect(isValidEmail("user@example")).toBe(false);
  expect(isValidEmail("user..name@example.com")).toBe(false);
  expect(isValidEmail("a".repeat(64) + "@example.com")).toBe(true);
  expect(isValidEmail("a".repeat(65) + "@example.com")).toBe(false);
  expect(normalizeEmail("J.o.h.n+x@Gmail.com")).toBe("john@gmail.com");
});
