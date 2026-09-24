import { test, expect } from "vitest";
import { csp, parseCsp, serializeCsp } from "./index";

// CSP keywords must be single-quoted. Unquoted, `self` is a HOSTNAME: the
// policy `default-src self` allows a host called "self" and blocks the site's
// own origin — a policy that reads correctly and means something else.
test("csp() quotes keywords, nonces and hashes however they were written", () => {
  const out = csp({ defaultSrc: ["self"], scriptSrc: ["'self'", "none", "unsafe-inline", "https://a.com", "nonce-abc", "'nonce-def'", "sha256-xyz="] } as never);
  expect(out).toBe("default-src 'self'; script-src 'self' 'none' 'unsafe-inline' https://a.com 'nonce-abc' 'nonce-def' 'sha256-xyz='");
});

test("already-quoted and host sources are untouched", () => {
  expect(csp({ defaultSrc: ["'self'"], scriptSrc: ["'self'", "https://a.com", "*.cdn.com"] } as never)).toBe("default-src 'self'; script-src 'self' https://a.com *.cdn.com");
});

// CSP3 §6.6.1.2: when a directive name repeats, the FIRST occurrence is
// enforced. parseCsp() kept the last, describing a policy the browser does not apply.
test("parseCsp keeps the first of a duplicated directive", () => {
  const p = parseCsp("script-src 'self'; img-src *; script-src https://b.com");
  expect(p["script-src"]).toEqual(["'self'"]);
  expect(p["img-src"]).toEqual(["*"]);
  expect(serializeCsp(p)).toBe("script-src 'self'; img-src *");
});
