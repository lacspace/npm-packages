import { describe, it, expect } from "vitest";
import { fromOpenApi, toOpenApi } from "./openapi.js";
import type { JSONSchema } from "./types.js";

describe("fromOpenApi", () => {
  it("extracts component schemas from an OpenAPI 3 doc", () => {
    const doc = {
      openapi: "3.0.3",
      info: { title: "T", version: "1" },
      components: {
        schemas: {
          User: { type: "object", properties: { id: { type: "integer" } } },
          Tag: { type: "string" },
        },
      },
    };
    const { version, schemas } = fromOpenApi(doc);
    expect(version).toBe("3");
    expect(Object.keys(schemas).sort()).toEqual(["Tag", "User"]);
    expect(schemas.User!.type).toBe("object");
  });

  it("extracts definitions from a Swagger 2 doc", () => {
    const doc = { swagger: "2.0", definitions: { Pet: { type: "object" } } };
    const { version, schemas } = fromOpenApi(doc);
    expect(version).toBe("2");
    expect(schemas.Pet!.type).toBe("object");
  });

  it("returns an empty map for a doc with no component schemas", () => {
    expect(fromOpenApi({ openapi: "3.0.0", paths: {} }).schemas).toEqual({});
  });

  it("returns unknown/empty for non-objects", () => {
    expect(fromOpenApi(42).schemas).toEqual({});
    expect(fromOpenApi(42).version).toBe("unknown");
  });
});

describe("toOpenApi", () => {
  const schemas: Record<string, JSONSchema> = {
    User: { $schema: "http://json-schema.org/draft-07/schema#", type: "object" },
  };

  it("wraps schemas into a components block and strips $schema", () => {
    const out = toOpenApi(schemas) as { components: { schemas: Record<string, JSONSchema> } };
    expect(out.components.schemas.User!.type).toBe("object");
    expect(out.components.schemas.User!.$schema).toBeUndefined();
  });

  it("emits a full minimal document when asked", () => {
    const out = toOpenApi(schemas, { full: true, title: "Svc", version: "2.1.0" }) as unknown as {
      openapi: string;
      info: { title: string; version: string };
      components: unknown;
    };
    expect(out.openapi).toBe("3.0.3");
    expect(out.info.title).toBe("Svc");
    expect(out.info.version).toBe("2.1.0");
    expect(out.components).toBeDefined();
  });

  it("round-trips fromOpenApi -> toOpenApi", () => {
    const doc = { components: { schemas: { A: { type: "integer" } } } };
    const { schemas: got } = fromOpenApi(doc);
    const wrapped = toOpenApi(got) as { components: { schemas: Record<string, JSONSchema> } };
    expect(wrapped.components.schemas.A!.type).toBe("integer");
  });
});
