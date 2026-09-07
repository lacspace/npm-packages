import { describe, it, expect } from "vitest";
import { validate, isValid } from "./validate.js";
import type { Schema } from "./validate.js";

describe("validate", () => {
  it("passes a matching primitive and flags a type mismatch", () => {
    expect(validate("hi", { type: "string" })).toEqual([]);
    const errs = validate(5, { type: "string" });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("expected string");
  });

  it("distinguishes integer from number", () => {
    expect(isValid(3, { type: "integer" })).toBe(true);
    expect(isValid(3.5, { type: "integer" })).toBe(false);
    expect(isValid(3.5, { type: "number" })).toBe(true);
  });

  it("reports missing required properties with their path", () => {
    const schema: Schema = { type: "object", required: ["name", "age"], properties: {} };
    const errs = validate({ name: "Ava" }, schema);
    expect(errs).toEqual([{ path: "age", message: "is required" }]);
  });

  it("validates nested properties", () => {
    const schema: Schema = {
      type: "object",
      properties: { profile: { type: "object", properties: { age: { type: "integer" } } } },
    };
    const errs = validate({ profile: { age: "old" } }, schema);
    expect(errs[0]!.path).toBe("profile.age");
  });

  it("enforces enum membership", () => {
    const schema: Schema = { enum: ["a", "b"] };
    expect(isValid("a", schema)).toBe(true);
    expect(isValid("z", schema)).toBe(false);
  });

  it("enforces numeric bounds", () => {
    expect(isValid(5, { type: "number", minimum: 1, maximum: 10 })).toBe(true);
    expect(isValid(0, { type: "number", minimum: 1 })).toBe(false);
    expect(isValid(11, { type: "number", maximum: 10 })).toBe(false);
  });

  it("enforces string length and pattern", () => {
    expect(isValid("abc", { type: "string", minLength: 2, maxLength: 4 })).toBe(true);
    expect(isValid("a", { type: "string", minLength: 2 })).toBe(false);
    expect(isValid("2020-01-01", { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })).toBe(true);
    expect(isValid("nope", { type: "string", pattern: "^\\d+$" })).toBe(false);
  });

  it("validates array items and length", () => {
    const schema: Schema = { type: "array", items: { type: "integer" }, minItems: 1 };
    expect(isValid([1, 2, 3], schema)).toBe(true);
    expect(isValid([], schema)).toBe(false);
    const errs = validate([1, "x"], { type: "array", items: { type: "integer" } });
    expect(errs[0]!.path).toBe("[1]");
  });

  it("rejects unknown props when additionalProperties is false", () => {
    const schema: Schema = { type: "object", properties: { a: { type: "string" } }, additionalProperties: false };
    expect(isValid({ a: "x" }, schema)).toBe(true);
    expect(isValid({ a: "x", b: 1 }, schema)).toBe(false);
  });

  it("allows null when nullable", () => {
    expect(isValid(null, { type: "string", nullable: true })).toBe(true);
    expect(isValid(null, { type: "string" })).toBe(false);
  });
});
