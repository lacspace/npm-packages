import { describe, it, expect } from "vitest";
import { validateSchema } from "./schema.js";

describe("schema validation", () => {
  const userSchema = {
    type: "object",
    required: ["name", "age"],
    properties: {
      name: { type: "string", minLength: 1 },
      age: { type: "integer", minimum: 0, maximum: 150 },
      email: { type: "string", format: "email" },
      role: { enum: ["admin", "user"] },
    },
    additionalProperties: false,
  };

  it("accepts a valid object", () => {
    const r = validateSchema({ name: "Ada", age: 36, email: "ada@x.io", role: "admin" }, userSchema);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("reports missing required", () => {
    const r = validateSchema({ name: "Ada" }, userSchema);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("required"))).toBe(true);
  });
  it("reports wrong type", () => {
    const r = validateSchema({ name: "Ada", age: "old" }, userSchema);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "$.age")).toBe(true);
  });
  it("enforces minimum/maximum", () => {
    expect(validateSchema({ name: "A", age: -1 }, userSchema).valid).toBe(false);
    expect(validateSchema({ name: "A", age: 200 }, userSchema).valid).toBe(false);
  });
  it("enforces integer vs number", () => {
    expect(validateSchema({ name: "A", age: 3.5 }, userSchema).valid).toBe(false);
  });
  it("enforces enum", () => {
    expect(validateSchema({ name: "A", age: 1, role: "root" }, userSchema).valid).toBe(false);
  });
  it("rejects additional properties when false", () => {
    expect(validateSchema({ name: "A", age: 1, extra: true }, userSchema).valid).toBe(false);
  });
  it("validates email format", () => {
    expect(validateSchema({ name: "A", age: 1, email: "nope" }, userSchema).valid).toBe(false);
  });
  it("validates array items and constraints", () => {
    const s = { type: "array", items: { type: "number" }, minItems: 2, uniqueItems: true };
    expect(validateSchema([1, 2, 3], s).valid).toBe(true);
    expect(validateSchema([1], s).valid).toBe(false);
    expect(validateSchema([1, 1], s).valid).toBe(false);
    expect(validateSchema([1, "x"], s).valid).toBe(false);
  });
  it("supports pattern + const", () => {
    expect(validateSchema("AB12", { type: "string", pattern: "^[A-Z]{2}\\d{2}$" }).valid).toBe(true);
    expect(validateSchema("nope", { type: "string", pattern: "^[A-Z]{2}\\d{2}$" }).valid).toBe(false);
    expect(validateSchema(5, { const: 5 }).valid).toBe(true);
    expect(validateSchema(6, { const: 5 }).valid).toBe(false);
  });
  it("supports anyOf / oneOf / allOf / not", () => {
    expect(validateSchema(3, { anyOf: [{ type: "string" }, { type: "number" }] }).valid).toBe(true);
    expect(validateSchema(true, { anyOf: [{ type: "string" }, { type: "number" }] }).valid).toBe(false);
    expect(validateSchema(3, { oneOf: [{ type: "number" }, { type: "integer" }] }).valid).toBe(false);
    expect(validateSchema("x", { not: { type: "number" } }).valid).toBe(true);
  });
  it("resolves local $ref", () => {
    const s = {
      $defs: { pos: { type: "integer", minimum: 1 } },
      type: "object",
      properties: { n: { $ref: "#/$defs/pos" } },
    };
    expect(validateSchema({ n: 5 }, s).valid).toBe(true);
    expect(validateSchema({ n: 0 }, s).valid).toBe(false);
  });
});
