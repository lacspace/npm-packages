import { test, expect } from "vitest";
import { securityHeaders, csp, strictCsp, generateNonce } from "./index";

test("securityHeaders returns expected keys with strict defaults", () => {
  const h = securityHeaders();
  expect(h["X-Content-Type-Options"]).toBe("nosniff");
  expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
  expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  expect(h["Strict-Transport-Security"]).toContain("max-age=");
  expect(h["Strict-Transport-Security"]).toContain("includeSubDomains");
});

test("hstsMaxAge 0 omits HSTS; frameOptions false omits X-Frame-Options", () => {
  const h = securityHeaders({ hstsMaxAge: 0, frameOptions: false });
  expect(h["Strict-Transport-Security"]).toBeUndefined();
  expect(h["X-Frame-Options"]).toBeUndefined();
});

test("csp builder emits directives (camelCase → kebab-case, valueless flags)", () => {
  const out = csp({
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https:"],
    upgradeInsecureRequests: true,
    blockAllMixedContent: false, // dropped
  });
  expect(out).toContain("default-src 'self'");
  expect(out).toContain("script-src 'self' https:");
  expect(out).toContain("upgrade-insecure-requests");
  expect(out).not.toContain("block-all-mixed-content");
  expect(out.split("; ").length).toBeGreaterThanOrEqual(3);
});

test("strictCsp includes the nonce when requested", () => {
  const nonce = generateNonce();
  expect(typeof nonce).toBe("string");
  expect(nonce.length).toBeGreaterThan(10);

  const withNonce = strictCsp({}, { nonce });
  expect(withNonce).toContain(`'nonce-${nonce}'`);
  expect(withNonce).toContain("script-src");

  // Without a nonce the baseline falls back to 'unsafe-inline' styles, no nonce.
  const without = strictCsp();
  expect(without).not.toContain("nonce-");
});
