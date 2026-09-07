import { describe, it, expect } from "vitest";
import { validate } from "./validate.js";
import type { JSONSchema } from "./types.js";

const user: JSONSchema = {
  type: "object",
  properties: {
    id: { type: "integer", minimum: 1 },
    email: { type: "string", format: "email" },
    role: { type: "string", enum: ["admin", "user"] },
    tags: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["id", "email", "role"],
  additionalProperties: false,
};

describe("validate — valid data", () => {
  it("accepts a fully valid object", () => {
    const r = validate(user, { id: 1, email: "a@x.com", role: "admin", tags: ["x"] });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("accepts when optional properties are omitted", () => {
    expect(validate(user, { id: 2, email: "b@y.org", role: "user" }).valid).toBe(true);
  });
});

describe("validate — error kinds", () => {
  it("flags a type mismatch", () => {
    const r = validate(user, { id: "nope", email: "a@x.com", role: "admin" });
    expect(r.valid).toBe(false);
    expect(r.errors[0]!.keyword).toBe("type");
    expect(r.errors[0]!.path).toBe("/id");
  });
  it("flags a missing required property", () => {
    const r = validate(user, { email: "a@x.com", role: "admin" });
    expect(r.errors.some((e) => e.keyword === "required" && e.path === "/id")).toBe(true);
  });
  it("flags an out-of-enum value", () => {
    const r = validate(user, { id: 1, email: "a@x.com", role: "root" });
    expect(r.errors.some((e) => e.keyword === "enum")).toBe(true);
  });
  it("flags a bad string format", () => {
    const r = validate(user, { id: 1, email: "not-an-email", role: "admin" });
    expect(r.errors.some((e) => e.keyword === "format")).toBe(true);
  });
  it("flags a value below minimum", () => {
    const r = validate(user, { id: 0, email: "a@x.com", role: "admin" });
    expect(r.errors.some((e) => e.keyword === "minimum")).toBe(true);
  });
  it("flags too many array items", () => {
    const r = validate(user, { id: 1, email: "a@x.com", role: "admin", tags: ["a", "b", "c", "d"] });
    expect(r.errors.some((e) => e.keyword === "maxItems")).toBe(true);
  });
  it("flags a disallowed additional property", () => {
    const r = validate(user, { id: 1, email: "a@x.com", role: "admin", extra: 1 });
    expect(r.errors.some((e) => e.keyword === "additionalProperties")).toBe(true);
  });
  it("flags an item-level error with an indexed path", () => {
    const r = validate(user, { id: 1, email: "a@x.com", role: "admin", tags: ["ok", 5] });
    expect(r.errors.some((e) => e.keyword === "type" && e.path === "/tags/1")).toBe(true);
  });
  it("flags minLength / maxLength / pattern", () => {
    const s: JSONSchema = { type: "string", minLength: 2, maxLength: 4, pattern: "^[a-z]+$" };
    expect(validate(s, "a").errors.some((e) => e.keyword === "minLength")).toBe(true);
    expect(validate(s, "abcde").errors.some((e) => e.keyword === "maxLength")).toBe(true);
    expect(validate(s, "AB").errors.some((e) => e.keyword === "pattern")).toBe(true);
  });
  it("flags const mismatch", () => {
    expect(validate({ const: 42 }, 43).errors[0]!.keyword).toBe("const");
  });
});

describe("validate — nullability", () => {
  it("accepts null when the type union includes null", () => {
    expect(validate({ type: ["string", "null"] }, null).valid).toBe(true);
  });
  it("accepts null when nullable is set (OpenAPI)", () => {
    expect(validate({ type: "string", nullable: true }, null).valid).toBe(true);
  });
  it("rejects null for a non-nullable field", () => {
    expect(validate({ type: "string" }, null).valid).toBe(false);
  });
});

describe("validate — combinators & $ref", () => {
  it("accepts an integer as a number", () => {
    expect(validate({ type: "number" }, 5).valid).toBe(true);
  });
  it("resolves and validates through $ref", () => {
    const schema: JSONSchema = {
      $ref: "#/$defs/U",
      $defs: { U: { type: "object", properties: { n: { type: "string" } }, required: ["n"] } },
    };
    expect(validate(schema, { n: "x" }).valid).toBe(true);
    expect(validate(schema, {}).valid).toBe(false);
  });
  it("resolves an OpenAPI-style components ref", () => {
    const schema: JSONSchema = {
      $ref: "#/components/schemas/U",
      components: { schemas: { U: { type: "integer" } } },
    } as unknown as JSONSchema;
    expect(validate(schema, 5).valid).toBe(true);
    expect(validate(schema, "x").valid).toBe(false);
  });
  it("honours anyOf", () => {
    const s: JSONSchema = { anyOf: [{ type: "string" }, { type: "integer" }] };
    expect(validate(s, "x").valid).toBe(true);
    expect(validate(s, 5).valid).toBe(true);
    expect(validate(s, true).valid).toBe(false);
  });
});
