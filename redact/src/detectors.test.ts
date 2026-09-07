import { test, expect } from "vitest";
import { scrubString } from "./deep";
import {
  luhnValid,
  ibanValid,
  maskKeepLast,
  maskCardNumber,
  maskEmailPartial,
  DETECTOR_NAMES,
} from "./detectors";

test("luhnValid accepts a valid card and rejects a bad checksum", () => {
  expect(luhnValid("4242 4242 4242 4242")).toBe(true);
  expect(luhnValid("4242 4242 4242 4241")).toBe(false);
  expect(luhnValid("1234")).toBe(false); // too short
});

test("creditCard: valid Luhn is redacted, invalid Luhn is left alone", () => {
  const good = scrubString("pay with 4242 4242 4242 4242 now", { detectors: ["creditCard"] });
  expect(good).not.toContain("4242 4242 4242 4242");

  // near-miss: Luhn-invalid number must NOT be flagged
  const bad = scrubString("order 4242 4242 4242 4241 ref", { detectors: ["creditCard"] });
  expect(bad).toContain("4242 4242 4242 4241");
});

test("ssn: positive with dashes, negative for bare 9 digits", () => {
  expect(scrubString("ssn 123-45-6789 end", { detectors: ["ssn"] })).toContain("[REDACTED_SSN]");
  expect(scrubString("num 123456789 end", { detectors: ["ssn"] })).toContain("123456789");
});

test("phone: E.164 and US formats redacted, short number ignored", () => {
  expect(scrubString("call +14155552671", { detectors: ["phone"] })).toContain("[REDACTED_PHONE]");
  expect(scrubString("call 415-555-2671", { detectors: ["phone"] })).toContain("[REDACTED_PHONE]");
  expect(scrubString("pin 12345", { detectors: ["phone"] })).toContain("12345");
});

test("email: positive masks local part, non-email untouched", () => {
  const out = scrubString("reach john.doe@example.com", { detectors: ["email"] });
  expect(out).not.toContain("john.doe@example.com");
  expect(out).toContain("@example.com");
  expect(scrubString("no address here", { detectors: ["email"] })).toBe("no address here");
});

test("ipv4: valid masked, out-of-range octets ignored", () => {
  expect(scrubString("host 192.168.1.42", { detectors: ["ipv4"] })).not.toContain("192.168.1.42");
  expect(scrubString("ver 999.999.999.999", { detectors: ["ipv4"] })).toContain("999.999.999.999");
});

test("ipv6 is redacted", () => {
  const out = scrubString("addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334 x", { detectors: ["ipv6"] });
  expect(out).toContain("[REDACTED_IPV6]");
});

test("jwt is redacted", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF_-123";
  expect(scrubString(`t=${jwt}`, { detectors: ["jwt"] })).toContain("[REDACTED_JWT]");
});

test("awsAccessKey: real-shaped id redacted, too-short ignored", () => {
  expect(scrubString("AKIAIOSFODNN7EXAMPLE", { detectors: ["awsAccessKey"] })).not.toContain("AKIAIOSFODNN7EXAMPLE");
  expect(scrubString("AKIA123", { detectors: ["awsAccessKey"] })).toContain("AKIA123");
});

test("github, slack and stripe tokens are redacted", () => {
  const gh = "ghp_" + "a".repeat(36);
  const slack = "xox" + "b-1234567890-abcdEFGHijkl";
  const stripe = "sk_" + "live_abcd1234abcd1234efgh";
  expect(scrubString(gh, { detectors: ["githubToken"] })).toContain("[REDACTED_GITHUB_TOKEN]");
  expect(scrubString(slack, { detectors: ["slackToken"] })).toContain("[REDACTED_SLACK_TOKEN]");
  expect(scrubString(stripe, { detectors: ["stripeKey"] })).not.toContain(stripe);
});

test("private key block is redacted", () => {
  const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc123+/=\n-----END RSA PRIVATE KEY-----";
  const out = scrubString(`k=${key}`, { detectors: ["privateKey"] });
  expect(out).toContain("[REDACTED_PRIVATE_KEY]");
  expect(out).not.toContain("MIIabc123");
});

test("mac address: positive and negative", () => {
  expect(scrubString("mac 00:1B:44:11:3A:B7", { detectors: ["mac"] })).toContain("[REDACTED_MAC]");
  expect(scrubString("mac 00:1B:44", { detectors: ["mac"] })).toContain("00:1B:44");
});

test("iban: valid checksum redacted, bad checksum ignored", () => {
  expect(ibanValid("GB82 WEST 1234 5698 7654 32")).toBe(true);
  expect(ibanValid("GB00 WEST 1234 5698 7654 32")).toBe(false);
  const good = scrubString("iban GB82 WEST 1234 5698 7654 32", { detectors: ["iban"] });
  expect(good).not.toContain("WEST 1234 5698 7654 32");
  const bad = scrubString("iban GB00 WEST 1234 5698 7654 32", { detectors: ["iban"] });
  expect(bad).toContain("GB00 WEST 1234 5698 7654 32");
});

test("masking helpers keep the last N visible", () => {
  expect(maskKeepLast("4242424242424242", 4)).toBe("************4242");
  expect(maskCardNumber("4242424242424242")).toBe("**** **** **** 4242");
  expect(maskEmailPartial("john@example.com")).toBe("j***@example.com");
});

test("DETECTOR_NAMES exposes the full detector roster", () => {
  expect(DETECTOR_NAMES).toContain("creditCard");
  expect(DETECTOR_NAMES).toContain("iban");
  expect(DETECTOR_NAMES.length).toBeGreaterThanOrEqual(14);
});
