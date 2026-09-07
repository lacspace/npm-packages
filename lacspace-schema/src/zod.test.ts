import { describe, it, expect } from "vitest";
import { schemaToZod, jsonToZod } from "./zod.js";
import type { JSONSchema } from "./types.js";

describe("schemaToZod", () => {
  it("emits an import, const and inferred type for an object", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { id: { type: "integer" }, name: { type: "string" } },
      required: ["id", "name"],
    };
    const out = schemaToZod(schema, { name: "User" });
    expect(out).toContain('import { z } from "zod";');
    expect(out).toContain("export const User = z.object({");
    expect(out).toContain("id: z.number().int(),");
    expect(out).toContain("name: z.string(),");
    expect(out).toContain("export type User = z.infer<typeof User>;");
  });

  it("marks optional properties with .optional()", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a"],
    };
    const out = schemaToZod(schema);
    expect(out).toContain("a: z.string(),");
    expect(out).toContain("b: z.string().optional(),");
  });

  it("maps string formats to Zod refinements", () => {
    expect(schemaToZod({ type: "string", format: "email" })).toContain("z.string().email()");
    expect(schemaToZod({ type: "string", format: "uuid" })).toContain("z.string().uuid()");
    expect(schemaToZod({ type: "string", format: "uri" })).toContain("z.string().url()");
    expect(schemaToZod({ type: "string", format: "date-time" })).toContain("z.string().datetime()");
  });

  it("renders enums, const and unions", () => {
    expect(schemaToZod({ enum: ["a", "b"] })).toContain('z.enum(["a", "b"])');
    expect(schemaToZod({ const: 42 })).toContain("z.literal(42)");
    expect(schemaToZod({ anyOf: [{ type: "string" }, { type: "integer" }] })).toContain("z.union([");
  });

  it("renders arrays with item and count constraints", () => {
    const out = schemaToZod({ type: "array", items: { type: "string" }, minItems: 1 });
    expect(out).toContain("z.array(z.string()).min(1)");
  });

  it("applies numeric min/max and string length", () => {
    expect(schemaToZod({ type: "integer", minimum: 1, maximum: 9 })).toContain("z.number().int().min(1).max(9)");
    expect(schemaToZod({ type: "string", minLength: 2 })).toContain("z.string().min(2)");
  });

  it("makes null-union and nullable types .nullable()", () => {
    expect(schemaToZod({ type: ["string", "null"] })).toContain("z.string().nullable()");
    expect(schemaToZod({ type: "string", nullable: true })).toContain("z.string().nullable()");
  });

  it("factors a $ref into its own named const", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { addr: { $ref: "#/$defs/Address" } },
      required: ["addr"],
      $defs: { Address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    };
    const out = schemaToZod(schema, { name: "User" });
    expect(out).toContain("const Address = z.object({");
    expect(out).toContain("addr: Address,");
  });

  it("can omit the import and infer lines", () => {
    const out = schemaToZod({ type: "string" }, { includeImport: false, includeInfer: false });
    expect(out).not.toContain("import { z }");
    expect(out).not.toContain("z.infer");
  });
});

describe("jsonToZod", () => {
  it("infers then emits Zod from samples", () => {
    const out = jsonToZod([{ id: 1, tags: ["a"] }], { name: "Post" });
    expect(out).toContain("export const Post = z.object({");
    expect(out).toContain("id: z.number().int(),");
    expect(out).toContain("tags: z.array(z.string()),");
  });
  it("honours enumThreshold", () => {
    const out = jsonToZod([{ s: "a" }, { s: "b" }, { s: "a" }], { name: "E", enumThreshold: 3 });
    expect(out).toContain('z.enum(["a", "b"])');
  });
});
