import { test, expect } from "vitest";
import { smtpCheck } from "./index";

// These tests exercise ONLY the pure syntax/security guards in smtpCheck.
// The CRLF guard returns synchronously via Promise.resolve BEFORE any socket
// is opened, so no network I/O happens.

test("CRLF-injected email returns 'undeliverable' without opening a socket", async () => {
  const start = Date.now();
  const verdict = await smtpCheck(
    "victim@example.com\r\nRCPT TO:<evil@example.com>",
    "mx.example.com",
  );
  expect(verdict).toBe("undeliverable");
  // Resolves immediately — no connect/timeout involved.
  expect(Date.now() - start).toBeLessThan(500);
});

test("CRLF in the MX host is rejected", async () => {
  const verdict = await smtpCheck("user@example.com", "mx.example.com\r\nQUIT");
  expect(verdict).toBe("undeliverable");
});

test("bare LF in the email is rejected", async () => {
  const verdict = await smtpCheck("user@example.com\nDATA", "mx.example.com");
  expect(verdict).toBe("undeliverable");
});
