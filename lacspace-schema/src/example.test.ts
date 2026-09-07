import { describe, it, expect } from "vitest";
import { schemaToExample } from "./example.js";
import type { JSONSchema } from "./types.js";

describe("schemaToExample", () => {
  it("includes required properties", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { id: { type: "integer" }, name: { type: "string" } },
      required: ["id", "name"],
    };
    const ex = schemaToExample(schema, { includeOptional: false }) as Record<string, unknown>;
    expect(ex).toHaveProperty("id");
    expect(ex).toHaveProperty("name");
    expect(typeof ex.id).toBe("number");
    expect(typeof ex.name).toBe("string");
  });

  it("uses the first enum value", () => {
    expect(schemaToExample({ enum: ["active", "paused"] })).toBe("active");
  });

  it("honours const", () => {
    expect(schemaToExample({ const: 42 })).toBe(42);
  });

  it("prefers a declared default", () => {
    expect(schemaToExample({ type: "string", default: "hi" })).toBe("hi");
  });

  it("produces format-appropriate strings", () => {
    expect(schemaToExample({ type: "string", format: "email" })).toBe("user@example.com");
    expect(schemaToExample({ type: "string", format: "date" })).toBe("2020-01-01");
    expect(schemaToExample({ type: "string", format: "uuid" })).toMatch(/-4000-/);
  });

  it("respects numeric minimum", () => {
    expect(schemaToExample({ type: "integer", minimum: 5 })).toBe(5);
  });

  it("builds a single-item array from items", () => {
    const ex = schemaToExample({ type: "array", items: { type: "string" } });
    expect(ex).toEqual(["string"]);
  });

  it("respects minItems", () => {
    const ex = schemaToExample({ type: "array", items: { type: "boolean" }, minItems: 2 }) as unknown[];
    expect(ex).toHaveLength(2);
  });

  it("resolves $ref", () => {
    const schema: JSONSchema = {
      $ref: "#/$defs/U",
      $defs: { U: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
    };
    const ex = schemaToExample(schema) as Record<string, unknown>;
    expect(ex.name).toBe("string");
  });

  it("breaks $ref cycles by returning null", () => {
    const schema: JSONSchema = {
      $ref: "#/$defs/N",
      $defs: {
        N: { type: "object", properties: { next: { $ref: "#/$defs/N" } }, required: ["next"] },
      },
    };
    const ex = schemaToExample(schema) as Record<string, unknown>;
    expect(ex.next).toBeNull();
  });

  it("takes the first anyOf branch", () => {
    expect(schemaToExample({ anyOf: [{ type: "boolean" }, { type: "string" }] })).toBe(true);
  });

  it("can exclude optional properties", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a"],
    };
    const ex = schemaToExample(schema, { includeOptional: false }) as Record<string, unknown>;
    expect(ex).toHaveProperty("a");
    expect(ex).not.toHaveProperty("b");
  });
});
