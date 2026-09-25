import { describe, test, expect } from "vitest";
import { applyDefaults, validate, type JsonSchema } from "./schema";

const schema: JsonSchema = {
  type: "object",
  properties: {
    url: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
    include: { type: "array", items: { type: "string", enum: ["a", "b"] } },
    headers: { type: "object", additionalProperties: { type: "string" } },
    mode: { anyOf: [{ type: "string" }, { type: "boolean" }] },
  },
  required: ["url"],
  additionalProperties: false,
};

describe("validate", () => {
  test("accepts a valid object", () => {
    expect(validate(schema, { url: "https://x", limit: 3, include: ["a"], headers: { a: "b" }, mode: true })).toEqual([]);
  });
  test("names every problem with its path", () => {
    const problems = validate(schema, { limit: 1.5, include: ["z"], headers: { a: 1 }, extra: 1 });
    expect(problems).toEqual(expect.arrayContaining([
      "arguments.url is required",
      "arguments.limit must be integer, got number",
      'arguments.include[0] must be one of "a", "b"',
      "arguments.headers.a must be string, got integer",
      "arguments.extra is not a known option",
    ]));
  });
  test("integer accepts whole numbers, number accepts integers", () => {
    expect(validate({ type: "integer" }, 3)).toEqual([]);
    expect(validate({ type: "number" }, 3)).toEqual([]);
    expect(validate({ type: "integer" }, 3.5)).toHaveLength(1);
  });
  test("range and enum", () => {
    expect(validate(schema, { url: "x", limit: 11 })).toEqual(["arguments.limit must be <= 10"]);
    expect(validate({ type: "string", enum: ["a"] }, "b")).toHaveLength(1);
  });
  test("non-object arguments are rejected", () => {
    expect(validate(schema, "nope")).toEqual(["arguments must be object, got string"]);
    expect(validate(schema, null)).toEqual(["arguments must be object, got null"]);
  });
});

describe("applyDefaults", () => {
  test("fills absent properties only", () => {
    expect(applyDefaults(schema, { url: "x" })).toEqual({ url: "x", limit: 5 });
    expect(applyDefaults(schema, { url: "x", limit: 2 })).toEqual({ url: "x", limit: 2 });
  });
});
