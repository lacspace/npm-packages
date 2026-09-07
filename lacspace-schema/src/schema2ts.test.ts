import { describe, it, expect } from "vitest";
import { jsonToTs, schemaToTs } from "./schema2ts.js";
import type { JSONSchema } from "./types.js";

describe("JSON -> TS", () => {
  it("names the root and extracts nested interfaces", () => {
    const ts = jsonToTs([{ id: 1, addr: { city: "KTM" } }], { name: "User" });
    expect(ts).toContain("export interface User {");
    expect(ts).toContain("export interface Addr {");
    expect(ts).toContain("addr: Addr;");
    expect(ts).toContain("city: string;");
  });

  it("marks optional properties with ?", () => {
    const ts = jsonToTs([{ a: 1, b: 2 }, { a: 1 }], { name: "T" });
    expect(ts).toMatch(/a: number;/);
    expect(ts).toMatch(/b\?: number;/);
  });

  it("renders arrays as T[] and names item interfaces (singular)", () => {
    const ts = jsonToTs([{ tags: [{ label: "x" }] }], { name: "Post" });
    expect(ts).toContain("tags: Tag[];");
    expect(ts).toContain("export interface Tag {");
  });

  it("renders unions for mixed scalar types", () => {
    const ts = jsonToTs([{ v: 1 }, { v: "x" }], { name: "T" });
    expect(ts).toMatch(/v: (number \| string|string \| number);/);
  });

  it("supports readonly properties", () => {
    const ts = jsonToTs([{ a: 1 }], { name: "T", readonly: true });
    expect(ts).toContain("readonly a: number;");
  });

  it("quotes non-identifier keys", () => {
    const ts = jsonToTs([{ "first-name": "a", "1x": 2 }], { name: "T" });
    expect(ts).toContain('"first-name": string;');
    expect(ts).toContain('"1x": number;');
  });

  it("adds JSDoc example comments with --jsdoc", () => {
    const ts = jsonToTs([{ id: 7 }], { name: "T", jsdoc: true });
    expect(ts).toContain("@example 7");
  });

  it("renders empty objects as Record<string, unknown>", () => {
    const ts = jsonToTs([{ meta: {} }], { name: "T" });
    expect(ts).toContain("meta: Record<string, unknown>;");
  });
});

describe("Schema -> TS", () => {
  it("uses required to decide optionality", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    };
    const ts = schemaToTs(schema, { name: "T" });
    expect(ts).toContain("a: string;");
    expect(ts).toContain("b?: number;");
  });

  it("turns enums into string-literal unions by default", () => {
    const ts = schemaToTs({ enum: ["a", "b"] }, { name: "Kind" });
    expect(ts).toContain('"a" | "b"');
  });

  it("emits a TS enum with the enum option", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { status: { enum: ["active", "paused"] } },
      required: ["status"],
    };
    const ts = schemaToTs(schema, { name: "T", enum: true });
    expect(ts).toContain("export enum Status {");
    expect(ts).toContain('Active = "active",');
    expect(ts).toContain("status: Status;");
  });

  it("renders const literals", () => {
    const ts = schemaToTs({ type: "object", properties: { k: { const: "v" } }, required: ["k"] }, { name: "T" });
    expect(ts).toContain('k: "v";');
  });

  it("renders anyOf as a union", () => {
    const ts = schemaToTs({ anyOf: [{ type: "string" }, { type: "number" }] }, { name: "T" });
    expect(ts).toContain("string | number");
  });

  it("resolves $ref to $defs", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { owner: { $ref: "#/$defs/User" } },
      required: ["owner"],
      $defs: { User: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
    };
    const ts = schemaToTs(schema, { name: "Account" });
    expect(ts).toContain("export interface User {");
    expect(ts).toContain("owner: User;");
  });

  it("handles $ref cycles without infinite recursion", () => {
    const schema: JSONSchema = {
      $ref: "#/$defs/Node",
      $defs: {
        Node: {
          type: "object",
          properties: { next: { $ref: "#/$defs/Node" } },
          required: [],
        },
      },
    };
    const ts = schemaToTs(schema, { name: "Root" });
    expect(ts).toContain("export interface Node {");
    expect(ts).toContain("next?: Node;");
  });

  it("renders nullable type arrays as unions with null", () => {
    const ts = schemaToTs({ type: "object", properties: { x: { type: ["string", "null"] } }, required: ["x"] }, { name: "T" });
    expect(ts).toContain("x: string | null;");
  });

  it("renders an index signature for additionalProperties", () => {
    const ts = schemaToTs({ type: "object", additionalProperties: { type: "number" } }, { name: "Map" });
    expect(ts).toContain("Record<string, number>");
  });
});
