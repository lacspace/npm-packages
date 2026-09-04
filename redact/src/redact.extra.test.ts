import { test, expect } from "vitest";
import { redact } from "./index";

test("a Date value is preserved, not flattened to {}", () => {
  const d = new Date("2024-01-02T03:04:05.000Z");
  const out = redact({ createdAt: d, name: "safe" });
  expect(out.createdAt).toBeInstanceOf(Date);
  expect((out.createdAt as Date).getTime()).toBe(d.getTime());
  expect(out.name).toBe("safe");
});

test("Map, Set and Buffer pass through intact", () => {
  const map = new Map<string, number>([["a", 1]]);
  const set = new Set<number>([1, 2, 3]);
  const buf = Buffer.from("hello");
  const out = redact({ map, set, buf });
  expect(out.map).toBe(map);
  expect(out.map.get("a")).toBe(1);
  expect(out.set).toBe(set);
  expect(out.set.has(2)).toBe(true);
  expect(Buffer.isBuffer(out.buf)).toBe(true);
  expect(out.buf.toString()).toBe("hello");
});

test("plain-object secret masking still works alongside preserved types", () => {
  const out = redact({
    password: "hunter2",
    when: new Date(0),
    nested: { token: "abc", ok: "keep" },
  });
  expect(out.password).toBe("[REDACTED]");
  expect(out.nested.token).toBe("[REDACTED]");
  expect(out.nested.ok).toBe("keep");
  expect(out.when).toBeInstanceOf(Date);
});
