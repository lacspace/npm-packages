import { test, expect } from "vitest";
import { validateStrict, defineTool, jsonSchema, ToolArgumentError } from "./index";

test("enforces string minLength / maxLength / pattern", () => {
  const schema = { type: "object", properties: { code: { type: "string", minLength: 2, maxLength: 4, pattern: "^[A-Z]+$" } }, required: ["code"] } as const;
  expect(validateStrict({ code: "ABC" }, schema as any)).toEqual({ code: "ABC" });
  expect(() => validateStrict({ code: "A" }, schema as any)).toThrow(ToolArgumentError);
  expect(() => validateStrict({ code: "ABCDE" }, schema as any)).toThrow(/at most 4/);
  expect(() => validateStrict({ code: "abc" }, schema as any)).toThrow(/must match/);
});

test("enforces numeric minimum / maximum / multipleOf and still coerces strings", () => {
  const schema = { type: "object", properties: { age: { type: "integer", minimum: 0, maximum: 120, multipleOf: 2 } }, required: ["age"] } as const;
  expect(validateStrict({ age: "10" }, schema as any)).toEqual({ age: 10 });
  expect(() => validateStrict({ age: -1 }, schema as any)).toThrow(/>= 0/);
  expect(() => validateStrict({ age: 200 }, schema as any)).toThrow(/<= 120/);
  expect(() => validateStrict({ age: 3 }, schema as any)).toThrow(/multiple of 2/);
});

test("enforces exclusiveMinimum / exclusiveMaximum", () => {
  const schema = { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 } as const;
  expect(validateStrict(0.5, schema as any)).toBe(0.5);
  expect(() => validateStrict(0, schema as any)).toThrow(/> 0/);
  expect(() => validateStrict(1, schema as any)).toThrow(/< 1/);
});

test("enforces array minItems / maxItems / uniqueItems and recurses items", () => {
  const schema = { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 3, uniqueItems: true } as const;
  expect(validateStrict(["a", "b"], schema as any)).toEqual(["a", "b"]);
  expect(() => validateStrict([], schema as any)).toThrow(/at least 1/);
  expect(() => validateStrict(["a", "a"], schema as any)).toThrow(/unique/);
  expect(() => validateStrict(["a", "b", "c", "d"], schema as any)).toThrow(/at most 3/);
  expect(() => validateStrict([""], schema as any)).toThrow(/at least 1 character/);
});

test("checks the format keyword (email / uuid / date-time)", () => {
  expect(validateStrict("a@b.com", { type: "string", format: "email" } as any)).toBe("a@b.com");
  expect(() => validateStrict("nope", { type: "string", format: "email" } as any)).toThrow(/valid email/);
  expect(() => validateStrict("not-a-uuid", { type: "string", format: "uuid" } as any)).toThrow(/valid uuid/);
  expect(validateStrict("2020-01-01T00:00:00Z", { type: "string", format: "date-time" } as any)).toBeTruthy();
});

test("enforces const and enum with deep equality", () => {
  expect(validateStrict("prod", { const: "prod" } as any)).toBe("prod");
  expect(() => validateStrict("dev", { const: "prod" } as any)).toThrow(/must equal/);
  expect(validateStrict({ a: 1 }, { const: { a: 1 } } as any)).toEqual({ a: 1 });
});

test("supports anyOf and oneOf combinators", () => {
  const anyOf = { anyOf: [{ type: "string" }, { type: "number" }] } as const;
  expect(validateStrict("x", anyOf as any)).toBe("x");
  expect(validateStrict(3, anyOf as any)).toBe(3);
  expect(() => validateStrict(true, anyOf as any)).toThrow(/did not match/);

  const oneOf = { oneOf: [{ type: "number", minimum: 10 }, { type: "number", maximum: 5 }] } as const;
  expect(validateStrict(3, oneOf as any)).toBe(3);
  expect(() => validateStrict(7, oneOf as any)).toThrow(/exactly one/);
});

test("accepts null via a type array and rejects unknown props when additionalProperties:false", () => {
  expect(validateStrict(null, { type: ["string", "null"] } as any)).toBeNull();
  const schema = { type: "object", properties: { a: { type: "string" } }, additionalProperties: false } as const;
  expect(validateStrict({ a: "x" }, schema as any)).toEqual({ a: "x" });
  expect(() => validateStrict({ a: "x", b: 1 }, schema as any)).toThrow(/not an allowed property/);
});

test("defineTool({ strict: true }) validates with the strict checker", async () => {
  const tool = defineTool({
    strict: true,
    name: "register",
    description: "Register a user.",
    parameters: jsonSchema.object({
      email: jsonSchema.string().format("email"),
      age: jsonSchema.integer().min(18),
    }),
    handler: ({ email, age }) => `${email}:${age}`,
  });
  expect(await tool.run({ email: "a@b.com", age: 20 })).toBe("a@b.com:20");
  await expect(tool.run({ email: "bad", age: 20 })).rejects.toThrow(/valid email/);
  await expect(tool.run({ email: "a@b.com", age: 15 })).rejects.toThrow(/>= 18/);
});

test("without strict the extra keywords are ignored (backward-compatible default)", async () => {
  const tool = defineTool({
    name: "register",
    description: "Register.",
    parameters: jsonSchema.object({ age: jsonSchema.integer().min(18) }),
    handler: ({ age }) => age,
  });
  // min(18) is emitted as `minimum` but the default validator does not enforce it.
  expect(await tool.run({ age: 5 })).toBe(5);
});
