import { describe, it, expect } from "vitest";
import { resolveRef, refName } from "./refs.js";
import { schemaToTs } from "./schema2ts.js";
import { schemaToExample } from "./example.js";
import type { JSONSchema } from "./types.js";

describe("resolveRef", () => {
  const root: JSONSchema = {
    $defs: { A: { type: "string" } },
    definitions: { B: { type: "integer" } },
    components: { schemas: { C: { type: "boolean" } } },
  } as unknown as JSONSchema;

  it("resolves #/$defs, #/definitions and #/components/schemas", () => {
    expect(resolveRef(root, "#/$defs/A")!.type).toBe("string");
    expect(resolveRef(root, "#/definitions/B")!.type).toBe("integer");
    expect(resolveRef(root, "#/components/schemas/C")!.type).toBe("boolean");
  });
  it("resolves the root pointer", () => {
    expect(resolveRef(root, "#")).toBe(root);
  });
  it("returns null for a missing or remote ref", () => {
    expect(resolveRef(root, "#/$defs/Nope")).toBeNull();
    expect(resolveRef(root, "https://x/y")).toBeNull();
  });
  it("extracts the trailing name segment", () => {
    expect(refName("#/components/schemas/User")).toBe("User");
    expect(refName("#/$defs/Address")).toBe("Address");
  });
});

describe("$ref support across engines", () => {
  const schema: JSONSchema = {
    type: "object",
    properties: { addr: { $ref: "#/components/schemas/Address" } },
    required: ["addr"],
    components: { schemas: { Address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
  } as unknown as JSONSchema;

  it("schemaToTs resolves an OpenAPI components ref into a named interface", () => {
    const ts = schemaToTs(schema, { name: "User" });
    expect(ts).toContain("interface Address");
    expect(ts).toContain("addr: Address;");
  });
  it("schemaToExample resolves a components ref", () => {
    const ex = schemaToExample(schema) as { addr: { city: string } };
    expect(ex.addr.city).toBe("string");
  });
});
