import { test, expect } from "vitest";
import { detectPii, redactPii, hasPii, luhnValid } from "./pii";

test("detects an email with correct offsets", () => {
  const text = "Contact me at jane.doe@example.com please";
  const f = detectPii(text);
  expect(f).toHaveLength(1);
  expect(f[0]!.type).toBe("email");
  expect(f[0]!.value).toBe("jane.doe@example.com");
  expect(text.slice(f[0]!.start, f[0]!.end)).toBe("jane.doe@example.com");
});

test("Luhn accepts a valid card and rejects an invalid one", () => {
  expect(luhnValid("4111111111111111")).toBe(true); // valid Visa test number
  expect(luhnValid("4111111111111112")).toBe(false); // last digit broken
  expect(luhnValid("1234567890123456")).toBe(false);
});

test("detects a Luhn-valid credit card but ignores a random digit run", () => {
  const good = detectPii("card 4111 1111 1111 1111 ok");
  expect(good.map((x) => x.type)).toContain("credit-card");

  const bad = detectPii("order 1234 5678 9012 3456 shipped");
  expect(bad.some((x) => x.type === "credit-card")).toBe(false);
});

test("detects US SSN", () => {
  const f = detectPii("SSN 123-45-6789");
  expect(f).toHaveLength(1);
  expect(f[0]!.type).toBe("ssn");
});

test("detects E.164 and US phone numbers", () => {
  expect(detectPii("call +14155552671")[0]!.type).toBe("phone");
  expect(detectPii("call 415-555-2671 today")[0]!.type).toBe("phone");
});

test("detects IPv4 and IPv6", () => {
  expect(detectPii("host 192.168.1.42")[0]!.type).toBe("ipv4");
  const v6 = detectPii("addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334");
  expect(v6[0]!.type).toBe("ipv6");
});

test("detects an IBAN", () => {
  const f = detectPii("pay to GB82WEST12345698765432");
  expect(f[0]!.type).toBe("iban");
});

test("detects common API-key shapes", () => {
  // Token literals are split across concatenation so the real (identical) runtime
  // value never appears as a contiguous string in source — avoids tripping secret
  // scanners / GitHub push-protection. AKIA…EXAMPLE is GitHub's allowlisted docs sample.
  expect(detectPii("key " + "sk-" + "abcdefghijklmnopqrstuvwx")[0]!.type).toBe("api-key");
  expect(detectPii("AKIAIOSFODNN7EXAMPLE here")[0]!.type).toBe("api-key");
  expect(
    detectPii("token " + "ghp_" + "0123456789abcdefghijklmnopqrstuvwxyz")[0]!.type,
  ).toBe("api-key");
});

test("higher-priority type wins on overlap (card, not phone)", () => {
  const f = detectPii("4111 1111 1111 1111");
  // Only one finding, and it must be the card — not a phone slice of the same digits.
  expect(f).toHaveLength(1);
  expect(f[0]!.type).toBe("credit-card");
});

test("findings are returned in source order", () => {
  const f = detectPii("ip 10.0.0.1 then mail x@y.io");
  expect(f.map((x) => x.type)).toEqual(["ipv4", "email"]);
  expect(f[0]!.start).toBeLessThan(f[1]!.start);
});

test("types option restricts detection", () => {
  const text = "x@y.com and 10.0.0.1";
  expect(detectPii(text, { types: ["email"] }).map((x) => x.type)).toEqual([
    "email",
  ]);
});

test("hasPii is true/false correctly", () => {
  expect(hasPii("plain harmless text")).toBe(false);
  expect(hasPii("reach me at a@b.com")).toBe(true);
});

test("redactPii uses the default mask", () => {
  const r = redactPii("mail a@b.com now");
  expect(r.text).toBe("mail [REDACTED_EMAIL] now");
  expect(r.findings).toHaveLength(1);
});

test("redactPii accepts a custom string mask", () => {
  const r = redactPii("mail a@b.com", { mask: "***" });
  expect(r.text).toBe("mail ***");
});

test("redactPii accepts a function mask and keeps offsets across multiple findings", () => {
  const r = redactPii("a@b.com / c@d.com", {
    mask: (f) => `<${f.type}>`,
  });
  expect(r.text).toBe("<email> / <email>");
  expect(r.findings).toHaveLength(2);
});

test("redactPii can target a subset of types", () => {
  const r = redactPii("a@b.com and 10.0.0.1", { types: ["ipv4"] });
  expect(r.text).toBe("a@b.com and [REDACTED_IPV4]");
});
