import { test, expect } from "vitest";
import { redactObject, createObjectRedactor } from "./deep";

test("deep redaction by KEY (case-insensitive, nested)", () => {
  const out = redactObject({
    Password: "hunter2",
    api_key: "secret",
    nested: { Authorization: "Bearer x", ok: "keep" },
    list: [{ ssn: "123-45-6789" }],
  }) as any;
  expect(out.Password).toBe("[REDACTED]");
  expect(out.api_key).toBe("[REDACTED]");
  expect(out.nested.Authorization).toBe("[REDACTED]");
  expect(out.nested.ok).toBe("keep");
  expect(out.list[0].ssn).toBe("[REDACTED]");
});

test("deep redaction by VALUE pattern in a non-sensitive key", () => {
  const out = redactObject({ note: "reach me at jane@example.com or 4242 4242 4242 4242" }) as any;
  expect(out.note).not.toContain("jane@example.com");
  expect(out.note).not.toContain("4242 4242 4242 4242");
});

test("cycle safety: circular refs become [Circular] and never throw", () => {
  const a: Record<string, unknown> = { name: "safe" };
  a.self = a;
  a.list = [a];
  let out: any;
  expect(() => (out = redactObject(a))).not.toThrow();
  expect(out.name).toBe("safe");
  expect(out.self).toBe("[Circular]");
  expect(out.list[0]).toBe("[Circular]");
});

test("maxDepth bounds recursion without throwing", () => {
  let deep: Record<string, unknown> = { password: "x" };
  for (let i = 0; i < 50; i++) deep = { child: deep };
  expect(() => redactObject(deep, { maxDepth: 3 })).not.toThrow();
});

test("keyAllowlist force-keeps a would-be-sensitive key", () => {
  const out = redactObject(
    { token: "abc", public_token: "show-me" },
    { keyAllowlist: ["public_token"] },
  ) as any;
  expect(out.token).toBe("[REDACTED]");
  expect(out.public_token).toBe("show-me");
});

test("partial masking keeps the last N visible instead of full redaction", () => {
  const out = redactObject(
    { note: "card 4242 4242 4242 4242" },
    { partial: { keepEnd: 4 }, detectors: ["creditCard"] },
  ) as any;
  expect(out.note).toContain("4242");
  expect(out.note).toContain("*");
  expect(out.note).not.toContain("4242 4242 4242 4242");
});

test("custom pattern + custom replacer", () => {
  const out = redactObject(
    { code: "ORDER-ABC123", email: "a@b.com" },
    {
      customPatterns: [{ name: "order", pattern: /ORDER-[A-Z0-9]+/g, replace: "[ORDER]" }],
      replacer: (_m, name) => `<${name}>`,
    },
  ) as any;
  // replacer overrides both detector defaults and customPattern's own replace
  expect(out.code).toBe("<order>");
  expect(out.email).toBe("<email>");
});

test("custom pattern uses its own replace when no global replacer", () => {
  const out = redactObject(
    { code: "ORDER-ABC123" },
    { customPatterns: [{ pattern: /ORDER-[A-Z0-9]+/g, replace: (m) => `[len:${m.length}]` }] },
  ) as any;
  expect(out.code).toBe("[len:12]");
});

test("detectors can be toggled off via a map", () => {
  const out = redactObject(
    { note: "ip 192.168.1.1 mail a@b.com" },
    { detectors: { ipv4: false } },
  ) as any;
  expect(out.note).toContain("192.168.1.1"); // ipv4 disabled
  expect(out.note).not.toContain("a@b.com"); // email still on
});

test("createObjectRedactor binds options for reuse", () => {
  const scrub = createObjectRedactor({ keys: ["x-internal"], mask: "***" });
  const out1 = scrub({ "x-internal": "1", ok: "a" }) as any;
  const out2 = scrub({ "x-internal": "2", ok: "b" }) as any;
  expect(out1["x-internal"]).toBe("***");
  expect(out2["x-internal"]).toBe("***");
  expect(out1.ok).toBe("a");
  expect(out2.ok).toBe("b");
});

test("never throws on exotic values (bigint, symbol, function)", () => {
  const sym = Symbol("s");
  const input: Record<string, unknown> = {
    big: 10n,
    fn: () => 42,
    sym,
    undef: undefined,
    password: "leak",
    [Symbol("k")]: "symkeyval",
  };
  let out: any;
  expect(() => (out = redactObject(input))).not.toThrow();
  expect(out.big).toBe(10n);
  expect(typeof out.fn).toBe("function");
  expect(out.sym).toBe(sym);
  expect(out.password).toBe("[REDACTED]");
});

test("throwing getter is handled gracefully", () => {
  const input = {
    get boom(): string {
      throw new Error("nope");
    },
    ok: "keep",
  };
  let out: any;
  expect(() => (out = redactObject(input))).not.toThrow();
  expect(out.boom).toBe("[unserializable]");
  expect(out.ok).toBe("keep");
});

test("Date / Map / Buffer preserved, not flattened", () => {
  const d = new Date("2024-01-02T03:04:05.000Z");
  const m = new Map([["a", 1]]);
  const out = redactObject({ d, m, password: "x" }) as any;
  expect(out.d).toBe(d);
  expect(out.m).toBe(m);
  expect(out.password).toBe("[REDACTED]");
});

test("top-level string is scrubbed", () => {
  const out = redactObject("email a@b.com and jwt eyJa.eyJb.sigABC");
  expect(out).not.toContain("a@b.com");
  expect(out).toContain("[REDACTED_JWT]");
});
