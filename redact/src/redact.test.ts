import { test, expect } from "vitest";
import { redact, redactString, maskEmail } from "./index";

test("sensitive key names are masked", () => {
  const out = redact({
    password: "hunter2",
    apiKey: "lac_live_secretvalue",
    authorization: "Bearer xyz",
    nested: { refresh_token: "abc", safe: "keepme" },
  });
  expect(out.password).toBe("[REDACTED]");
  expect(out.apiKey).toBe("[REDACTED]");
  expect(out.authorization).toBe("[REDACTED]");
  expect(out.nested.refresh_token).toBe("[REDACTED]");
  expect(out.nested.safe).toBe("keepme");
});

test("secret patterns in free text are masked", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF_-123";
  expect(redactString(`token=${jwt}`)).toContain("[REDACTED_JWT]");

  const cc = redactString("card 4111 1111 1111 1111 ok");
  expect(cc).not.toContain("4111 1111 1111 1111");

  const email = redactString("reach me at john.doe@example.com");
  expect(email).not.toContain("john.doe@example.com");
  expect(email).toContain("@example.com");
});

test("maskEmail keeps the domain", () => {
  expect(maskEmail("john@example.com")).toBe("j•••@example.com");
});

test("depth-bounded: does not hang on a cyclic object", () => {
  const a: Record<string, unknown> = { name: "safe" };
  a.self = a; // cycle
  // Must return without infinite recursion (maxDepth caps the walk).
  const out = redact(a, { maxDepth: 4 }) as Record<string, unknown>;
  expect(out.name).toBe("safe");
});

test("maxDepth stops deep recursion", () => {
  let deep: Record<string, unknown> = { password: "x" };
  for (let i = 0; i < 20; i++) deep = { child: deep };
  // Should complete quickly rather than blow the stack / hang.
  expect(() => redact(deep, { maxDepth: 3 })).not.toThrow();
});
