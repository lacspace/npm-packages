import { test, expect } from "vitest";
import {
  isValidEmailRFC5322,
  isDisposableEmail,
  isRoleAccount,
  isValidEmail,
  normalizeEmail,
  suggestEmail,
} from "./index";

test("RFC5322: is a superset of the core validator", () => {
  for (const ok of ["user@example.com", "first.last+tag@sub.domain.co", "a@b.co"]) {
    expect(isValidEmail(ok)).toBe(true);
    expect(isValidEmailRFC5322(ok)).toBe(true);
  }
});

test("RFC5322: accepts quoted local parts", () => {
  expect(isValidEmailRFC5322('"john doe"@example.com')).toBe(true);
  expect(isValidEmailRFC5322('"a@b"@example.com')).toBe(true);
  expect(isValidEmailRFC5322('"escaped\\"quote"@example.com')).toBe(true);
  // unterminated quote is rejected
  expect(isValidEmailRFC5322('"open@example.com')).toBe(false);
  // quoted acceptance can be turned off
  expect(isValidEmailRFC5322('"john doe"@example.com', { allowQuoted: false })).toBe(false);
});

test("RFC5322: accepts IP-literal domains", () => {
  expect(isValidEmailRFC5322("user@[192.168.0.1]")).toBe(true);
  expect(isValidEmailRFC5322("user@[255.255.255.255]")).toBe(true);
  expect(isValidEmailRFC5322("user@[IPv6:2001:db8::1]")).toBe(true);
  expect(isValidEmailRFC5322("user@[IPv6:::1]")).toBe(true);
  // invalid IPs / literals rejected
  expect(isValidEmailRFC5322("user@[999.0.0.1]")).toBe(false);
  expect(isValidEmailRFC5322("user@[192.168.0.1")).toBe(false);
  expect(isValidEmailRFC5322("user@[not-an-ip]")).toBe(false);
  // literal acceptance can be turned off
  expect(isValidEmailRFC5322("user@[192.168.0.1]", { allowIpLiteral: false })).toBe(false);
});

test("RFC5322: rejects consecutive and edge dots in local part", () => {
  expect(isValidEmailRFC5322("a..b@example.com")).toBe(false);
  expect(isValidEmailRFC5322(".a@example.com")).toBe(false);
  expect(isValidEmailRFC5322("a.@example.com")).toBe(false);
});

test("RFC5322: enforces length limits", () => {
  const local65 = "a".repeat(65) + "@example.com";
  expect(isValidEmailRFC5322(local65)).toBe(false);
  const local64 = "a".repeat(64) + "@example.com";
  expect(isValidEmailRFC5322(local64)).toBe(true);
  const total = "a".repeat(60) + "@" + ("b".repeat(63) + ".").repeat(3) + "com";
  expect(total.length).toBeGreaterThan(254);
  expect(isValidEmailRFC5322(total)).toBe(false);
});

test("RFC5322: rejects obvious garbage", () => {
  expect(isValidEmailRFC5322("nope")).toBe(false);
  expect(isValidEmailRFC5322("@example.com")).toBe(false);
  expect(isValidEmailRFC5322("a@b")).toBe(false); // no TLD
  expect(isValidEmailRFC5322(123 as unknown as string)).toBe(false);
});

test("isDisposableEmail: whole-address hit/miss", () => {
  expect(isDisposableEmail("x@mailinator.com")).toBe(true);
  expect(isDisposableEmail("x@GuerrillaMail.com")).toBe(true); // case-insensitive
  expect(isDisposableEmail("x@example.com")).toBe(false);
  expect(isDisposableEmail("not-an-email")).toBe(false);
  expect(isDisposableEmail("x@mycorp-temp.com", ["mycorp-temp.com"])).toBe(true);
});

test("isRoleAccount: whole-address hit/miss", () => {
  expect(isRoleAccount("info@acme.com")).toBe(true);
  expect(isRoleAccount("NoReply@acme.com")).toBe(true); // case-insensitive
  expect(isRoleAccount("support+ticket@acme.com")).toBe(true); // ignores +tag
  expect(isRoleAccount("jane@acme.com")).toBe(false);
  expect(isRoleAccount("")).toBe(false);
});

test("suggestEmail: fixes known typos, null when fine", () => {
  expect(suggestEmail("me@gmial.com")).toBe("me@gmail.com");
  expect(suggestEmail("me@hotmial.com")).toBe("me@hotmail.com");
  expect(suggestEmail("me@yahho.com")).toBe("me@yahoo.com");
  expect(suggestEmail("me@gmail.com")).toBeNull();
  expect(suggestEmail("me@lacspace.com")).toBeNull();
});

test("RFC5322: IPv4 octet bounds", () => {
  expect(isValidEmailRFC5322("u@[0.0.0.0]")).toBe(true);
  expect(isValidEmailRFC5322("u@[256.1.1.1]")).toBe(false);
  expect(isValidEmailRFC5322("u@[1.2.3]")).toBe(false);
});

test("RFC5322: empty IP literal rejected", () => {
  expect(isValidEmailRFC5322("u@[]")).toBe(false);
  expect(isValidEmailRFC5322("u@[IPv6:]")).toBe(false);
});

test("RFC5322: whitespace is trimmed before checking", () => {
  expect(isValidEmailRFC5322("  user@example.com  ")).toBe(true);
  expect(isValidEmailRFC5322("")).toBe(false);
  expect(isValidEmailRFC5322("   ")).toBe(false);
});

test("isDisposableEmail: extra list is case-insensitive", () => {
  expect(isDisposableEmail("x@Corp-Temp.com", ["corp-temp.com"])).toBe(true);
  expect(isDisposableEmail("x@corp-temp.com", ["CORP-TEMP.COM"])).toBe(true);
});

test("isRoleAccount: many role locals", () => {
  for (const r of ["admin", "support", "sales", "noreply", "postmaster", "billing"]) {
    expect(isRoleAccount(`${r}@acme.com`)).toBe(true);
  }
  expect(isRoleAccount("johnsmith@acme.com")).toBe(false);
});

test("suggestEmail: leaves an unfamiliar-but-distant domain alone", () => {
  expect(suggestEmail("me@somecompany.io")).toBeNull();
});

test("normalizeEmail: opts preserve dots/plus when asked", () => {
  // default still collapses gmail
  expect(normalizeEmail("Foo.Bar+promo@gmail.com")).toBe("foobar@gmail.com");
  // keep gmail dots
  expect(normalizeEmail("Foo.Bar@gmail.com", { gmailRemoveDots: false })).toBe(
    "foo.bar@gmail.com",
  );
  // keep gmail subaddress
  expect(normalizeEmail("foo+news@gmail.com", { gmailRemoveSubaddress: false })).toBe(
    "foo+news@gmail.com",
  );
  // keep +tag on other providers
  expect(normalizeEmail("a.b+x@Example.com", { removeSubaddress: false })).toBe(
    "a.b+x@example.com",
  );
  // preserve local-part case (domain always lowercased)
  expect(normalizeEmail("John.Doe@Acme.COM", { lowercaseLocal: false })).toBe(
    "John.Doe@acme.com",
  );
});
