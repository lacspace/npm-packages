import { test, expect } from "vitest";
import { jsonSchema } from "./index";

test(".min/.max map to the right keyword by type", () => {
  expect(jsonSchema.string().min(2).max(4).toJsonSchema()).toEqual({ type: "string", minLength: 2, maxLength: 4 });
  expect(jsonSchema.number().min(0).max(10).toJsonSchema()).toEqual({ type: "number", minimum: 0, maximum: 10 });
  expect(jsonSchema.integer().min(1).toJsonSchema()).toEqual({ type: "integer", minimum: 1 });
  expect(jsonSchema.array(jsonSchema.string()).min(1).max(3).toJsonSchema()).toEqual({
    type: "array",
    items: { type: "string" },
    minItems: 1,
    maxItems: 3,
  });
});

test(".pattern accepts a string or a RegExp, .format sets a format", () => {
  expect(jsonSchema.string().pattern("^x$").toJsonSchema()).toEqual({ type: "string", pattern: "^x$" });
  expect(jsonSchema.string().pattern(/^\d+$/).toJsonSchema()).toEqual({ type: "string", pattern: "^\\d+$" });
  expect(jsonSchema.string().format("email").toJsonSchema()).toEqual({ type: "string", format: "email" });
});

test(".default attaches a default value", () => {
  expect(jsonSchema.number().default(0).toJsonSchema()).toEqual({ type: "number", default: 0 });
});

test(".nullable widens the type with null and keeps optionality", () => {
  expect(jsonSchema.string().nullable().toJsonSchema()).toEqual({ type: ["string", "null"] });
  const shape = jsonSchema.object({ a: jsonSchema.string().nullable().optional() }).toJsonSchema();
  expect(shape.required).toBeUndefined();
  expect(shape.properties!.a).toEqual({ type: ["string", "null"] });
});

test("jsonSchema.literal produces a typed const", () => {
  expect(jsonSchema.literal("prod").toJsonSchema()).toEqual({ type: "string", const: "prod" });
  expect(jsonSchema.literal(42).toJsonSchema()).toEqual({ type: "number", const: 42 });
  expect(jsonSchema.literal(null).toJsonSchema()).toEqual({ type: "null", const: null });
});

test("jsonSchema.record / any / null", () => {
  expect(jsonSchema.record(jsonSchema.number()).toJsonSchema()).toEqual({
    type: "object",
    additionalProperties: { type: "number" },
  });
  expect(jsonSchema.any().toJsonSchema()).toEqual({});
  expect(jsonSchema.null().toJsonSchema()).toEqual({ type: "null" });
});

test("jsonSchema.anyOf / oneOf collect subschemas", () => {
  const anyOf = jsonSchema.anyOf([jsonSchema.string(), jsonSchema.number()]).toJsonSchema();
  expect(anyOf).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
  const oneOf = jsonSchema.oneOf([jsonSchema.literal("a"), jsonSchema.literal("b")]).toJsonSchema();
  expect(oneOf).toEqual({ oneOf: [{ type: "string", const: "a" }, { type: "string", const: "b" }] });
});

test("builder additions compose inside object() without touching existing behaviour", () => {
  const schema = jsonSchema
    .object({
      name: jsonSchema.string().min(1),
      role: jsonSchema.enum(["admin", "user"]).optional(),
    })
    .toJsonSchema();
  expect(schema).toEqual({
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      role: { type: "string", enum: ["admin", "user"] },
    },
  });
});
