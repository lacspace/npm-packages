import { describe, it, expect } from "vitest";
import { mockFromOpenApi, exampleFromSchema, openApiPathToPattern, derefToSchema } from "./openapi.js";
import type { OpenApiDoc } from "./openapi.js";
import { createEngine } from "./server.js";

const doc: OpenApiDoc = {
  openapi: "3.0.0",
  paths: {
    "/users": {
      get: {
        responses: {
          "200": {
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/User" } } } },
          },
        },
      },
      post: {
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/NewUser" } } } },
        responses: { "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
      },
    },
    "/users/{id}": {
      get: {
        responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string", example: "Ada" },
          role: { type: "string", enum: ["admin", "user"] },
          email: { type: "string", format: "email" },
        },
      },
      NewUser: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
    },
  },
};

describe("openApiPathToPattern", () => {
  it("converts {param} to :param", () => {
    expect(openApiPathToPattern("/users/{id}/posts/{postId}")).toBe("/users/:id/posts/:postId");
  });
});

describe("exampleFromSchema", () => {
  const schemas = doc.components!.schemas as Record<string, unknown>;

  it("builds an example object from properties, honouring example/enum/format", () => {
    const ex = exampleFromSchema({ $ref: "#/components/schemas/User" }, schemas, new Set(), 0) as Record<string, unknown>;
    expect(ex).toEqual({ id: 0, name: "Ada", role: "admin", email: "user@example.com" });
  });

  it("wraps array items in a one-element example", () => {
    const ex = exampleFromSchema({ type: "array", items: { type: "string" } }, schemas, new Set(), 0);
    expect(ex).toEqual(["string"]);
  });

  it("guards against $ref cycles", () => {
    const cyclic = { Node: { type: "object", properties: { next: { $ref: "#/components/schemas/Node" } } } };
    const ex = exampleFromSchema({ $ref: "#/components/schemas/Node" }, cyclic, new Set(), 0) as Record<string, unknown>;
    expect(ex).toHaveProperty("next");
  });
});

describe("mockFromOpenApi", () => {
  it("generates one route per operation with converted paths", () => {
    const { routes } = mockFromOpenApi(doc);
    const sigs = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(sigs).toEqual(["GET /users", "GET /users/:id", "POST /users"]);
  });

  it("uses the operation's response status and an example body", () => {
    const { routes } = mockFromOpenApi(doc);
    const post = routes.find((r) => r.method === "POST")!;
    expect(post.status).toBe(201);
    expect(post.body).toEqual({ id: 0, name: "Ada", role: "admin", email: "user@example.com" });
  });

  it("extracts request-body schemas for validation", () => {
    const { requestSchemas } = mockFromOpenApi(doc);
    const post = requestSchemas.find((s) => s.method === "POST" && s.path === "/users");
    expect(post?.schema.required).toEqual(["name"]);
  });

  it("feeds a working engine end-to-end", async () => {
    const { routes } = mockFromOpenApi(doc);
    const res = await createEngine({ routes }).handle({ method: "GET", url: "/users/1" });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty("name", "Ada");
  });
});

describe("derefToSchema", () => {
  it("resolves $ref into a validator schema", () => {
    const schemas = doc.components!.schemas as Record<string, unknown>;
    const s = derefToSchema({ $ref: "#/components/schemas/NewUser" }, schemas, new Set());
    expect(s.type).toBe("object");
    expect(s.required).toEqual(["name"]);
  });
});
