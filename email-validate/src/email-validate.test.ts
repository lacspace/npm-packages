import { test, expect } from "vitest";
import { isValidEmail, validateEmail, normalizeEmail } from "./index";

test("valid emails pass", () => {
  expect(isValidEmail("user@example.com")).toBe(true);
  expect(isValidEmail("first.last+tag@sub.domain.co")).toBe(true);
  expect(validateEmail("user@example.com").valid).toBe(true);
});

test("invalid emails fail", () => {
  expect(isValidEmail("foo")).toBe(false);
  expect(isValidEmail("a@b")).toBe(false); // no TLD
  expect(isValidEmail("@example.com")).toBe(false);
  expect(isValidEmail("user@@example.com")).toBe(false);
  expect(validateEmail("nope").valid).toBe(false);
});

test("disposable detection", () => {
  expect(validateEmail("x@mailinator.com").disposable).toBe(true);
  expect(validateEmail("x@example.com").disposable).toBe(false);
});

test("role-address detection", () => {
  expect(validateEmail("info@example.com").role).toBe(true);
  expect(validateEmail("jane@example.com").role).toBe(false);
});

test("gmail normalization strips dots and +tags", () => {
  expect(normalizeEmail("Foo.Bar+promo@gmail.com")).toBe("foobar@gmail.com");
  expect(normalizeEmail("First.Last@googlemail.com")).toBe("firstlast@gmail.com");
  // non-gmail: keep dots, strip +tag, lowercase
  expect(normalizeEmail("A.B+x@Example.com")).toBe("a.b@example.com");
});

test("a very long local part is rejected quickly (ReDoS-safe)", () => {
  const start = Date.now();
  const evil = "a".repeat(300) + "@example.com";
  expect(isValidEmail(evil)).toBe(false);
  const pathological = ("a.".repeat(40) + "a").slice(0, 64) + "!@example.com";
  expect(isValidEmail(pathological)).toBe(false);
  expect(Date.now() - start).toBeLessThan(1000);
});
