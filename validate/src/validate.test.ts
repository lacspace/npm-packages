import { test, expect } from "vitest";
import { v } from "./index";

test("object / string / number happy paths", () => {
  const User = v.object({
    name: v.string().min(2),
    age: v.number().int().min(0),
  });
  const r = User.safeParse({ name: "Ada", age: 36 });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data).toEqual({ name: "Ada", age: 36 });

  expect(v.string().safeParse(123).success).toBe(false);
  expect(v.number().safeParse("x").success).toBe(false);
  expect(v.number().int().safeParse(1.5).success).toBe(false);
});

test(".record() drops __proto__ and does not pollute Object.prototype", () => {
  const payload = JSON.parse('{"safe":"ok","__proto__":{"polluted":"yes"}}');
  const schema = v.record(v.any());
  const parsed = schema.parse(payload) as Record<string, unknown>;
  expect(parsed.safe).toBe("ok");
  expect("__proto__" in parsed && Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(false);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
});

test(".passthrough() drops unsafe keys and does not pollute Object.prototype", () => {
  const payload = JSON.parse('{"name":"Ada","__proto__":{"polluted":"yes"},"extra":1}');
  const schema = v.object({ name: v.string() }).passthrough();
  const parsed = schema.parse(payload) as Record<string, unknown>;
  expect(parsed.name).toBe("Ada");
  expect(parsed.extra).toBe(1); // safe unknown key kept
  expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(false);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test(".string().email() rejects a 500-char input and accepts a normal email", () => {
  const email = v.string().email();
  const huge = "a".repeat(490) + "@example.com"; // > 320 chars
  expect(email.safeParse(huge).success).toBe(false);
  expect(email.safeParse("user@example.com").success).toBe(true);
});
