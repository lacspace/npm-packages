import { describe, it, expect } from "vitest";
import { diffSchemas } from "./diff.js";
import type { JSONSchema } from "./types.js";

const obj = (props: Record<string, JSONSchema>, required: string[] = []): JSONSchema => ({
  type: "object",
  properties: props,
  required,
});

describe("diffSchemas", () => {
  it("reports no changes for identical schemas", () => {
    const s = obj({ a: { type: "string" } }, ["a"]);
    expect(diffSchemas(s, s).changes).toHaveLength(0);
    expect(diffSchemas(s, s).breaking).toBe(false);
  });

  it("flags a removed property as breaking", () => {
    const a = obj({ a: { type: "string" }, b: { type: "number" } });
    const b = obj({ a: { type: "string" } });
    const d = diffSchemas(a, b);
    expect(d.breaking).toBe(true);
    expect(d.changes.find((c) => c.path === "b")?.kind).toBe("removed");
  });

  it("flags an added optional property as non-breaking", () => {
    const a = obj({ a: { type: "string" } });
    const b = obj({ a: { type: "string" }, c: { type: "number" } });
    const d = diffSchemas(a, b);
    expect(d.breaking).toBe(false);
    expect(d.changes.find((c) => c.path === "c")?.kind).toBe("added");
  });

  it("flags an added required property as breaking", () => {
    const a = obj({ a: { type: "string" } });
    const b = obj({ a: { type: "string" }, c: { type: "number" } }, ["c"]);
    expect(diffSchemas(a, b).breaking).toBe(true);
  });

  it("flags a type change as breaking", () => {
    const a = obj({ a: { type: "string" } });
    const b = obj({ a: { type: "number" } });
    const d = diffSchemas(a, b);
    expect(d.changes[0]!.kind).toBe("type-changed");
    expect(d.breaking).toBe(true);
  });

  it("flags a field becoming required as breaking", () => {
    const a = obj({ a: { type: "string" } });
    const b = obj({ a: { type: "string" } }, ["a"]);
    const d = diffSchemas(a, b);
    expect(d.changes[0]!.kind).toBe("required-added");
    expect(d.breaking).toBe(true);
  });

  it("flags a field becoming optional as non-breaking", () => {
    const a = obj({ a: { type: "string" } }, ["a"]);
    const b = obj({ a: { type: "string" } });
    const d = diffSchemas(a, b);
    expect(d.changes[0]!.kind).toBe("required-removed");
    expect(d.breaking).toBe(false);
  });

  it("detects enum value changes and flags removals as breaking", () => {
    const a = obj({ s: { enum: ["x", "y"] } }, ["s"]);
    const b = obj({ s: { enum: ["x"] } }, ["s"]);
    const d = diffSchemas(a, b);
    const change = d.changes.find((c) => c.kind === "enum-changed");
    expect(change?.breaking).toBe(true);
  });

  it("recurses into nested objects", () => {
    const a = obj({ inner: obj({ x: { type: "string" } }) }, ["inner"]);
    const b = obj({ inner: obj({ x: { type: "number" } }) }, ["inner"]);
    const d = diffSchemas(a, b);
    expect(d.changes.find((c) => c.path === "inner.x")?.kind).toBe("type-changed");
  });
});
