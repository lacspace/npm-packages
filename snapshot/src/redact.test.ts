import { describe, it, expect } from "vitest";
import { redact, serialize } from "./index";

describe("redact", () => {
  it("redacts by key name (string and RegExp)", () => {
    const out = redact(
      { id: 42, name: "Ada", authToken: "secret" },
      { keys: ["id", /token/i] },
    ) as Record<string, unknown>;
    expect(out).toEqual({ id: "[redacted]", name: "Ada", authToken: "[redacted]" });
  });

  it("redacts by dot-path with wildcards", () => {
    const out = redact(
      { items: [{ id: 1, ok: true }, { id: 2, ok: false }] },
      { paths: ["items.*.id"] },
    ) as { items: Array<Record<string, unknown>> };
    expect(out.items[0]!.id).toBe("[redacted]");
    expect(out.items[1]!.id).toBe("[redacted]");
    expect(out.items[0]!.ok).toBe(true);
  });

  it("redacts by predicate", () => {
    const out = redact(
      { a: 1, when: new Date("2020-01-01T00:00:00Z"), b: 2 },
      { predicate: (v) => v instanceof Date },
    ) as Record<string, unknown>;
    expect(out.when).toBe("[redacted]");
    expect(out.a).toBe(1);
  });

  it("supports a custom string and functional replacement", () => {
    const out1 = redact({ id: 1 }, { keys: ["id"], replacement: "<id>" }) as Record<string, unknown>;
    expect(out1.id).toBe("<id>");
    const out2 = redact(
      { id: 7 },
      { keys: ["id"], replacement: ({ path }) => `[${path}]` },
    ) as Record<string, unknown>;
    expect(out2.id).toBe("[id]");
  });

  it("does not mutate the input and leaves non-plain objects intact when not redacted", () => {
    const input = { a: 1, m: new Map([["k", "v"]]) };
    const out = redact(input, { keys: ["a"] }) as { a: unknown; m: Map<string, string> };
    expect(input.a).toBe(1); // original untouched
    expect(out.a).toBe("[redacted]");
    expect(out.m).toBe(input.m); // Map passed through by reference
  });

  it("is circular-safe (shared and cyclic refs)", () => {
    const o: Record<string, unknown> = { id: 1 };
    o.self = o;
    const out = redact(o, { keys: ["id"] }) as Record<string, unknown>;
    expect(out.id).toBe("[redacted]");
    expect(out.self).toBe(out); // cycle preserved in the copy
  });

  it("produces a stable snapshot once volatile fields are redacted", () => {
    const make = () => ({ id: Math.random(), name: "x", ts: new Date() });
    const opts = { keys: ["id", "ts"] };
    expect(serialize(redact(make(), opts))).toBe(serialize(redact(make(), opts)));
  });
});
