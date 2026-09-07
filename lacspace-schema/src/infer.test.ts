import { describe, it, expect } from "vitest";
import { inferSchema, inferNode } from "./infer.js";

describe("scalar inference", () => {
  it("infers an integer", () => {
    expect(inferNode([1, 2, 3])).toEqual({ type: "integer" });
  });
  it("infers a float as number", () => {
    expect(inferNode([1.5])).toEqual({ type: "number" });
  });
  it("collapses mixed int + float to number", () => {
    expect(inferNode([1, 2.5])).toEqual({ type: "number" });
  });
  it("infers string and boolean", () => {
    expect(inferNode(["a"]).type).toBe("string");
    expect(inferNode([true, false]).type).toBe("boolean");
  });
  it("makes a scalar nullable via a type array", () => {
    expect(inferNode(["a", null]).type).toEqual(["string", "null"]);
  });
  it("returns type null for only-null samples", () => {
    expect(inferNode([null])).toEqual({ type: "null" });
  });
  it("returns a permissive schema for no samples", () => {
    expect(inferNode([])).toEqual({});
  });
});

describe("object inference & merging", () => {
  it("marks present-in-all keys required and others optional", () => {
    const s = inferSchema([
      { a: 1, b: "x" },
      { a: 2 },
    ]);
    expect(s.type).toBe("object");
    expect(s.required).toEqual(["a"]);
    expect(Object.keys(s.properties!)).toEqual(["a", "b"]);
  });
  it("--no-required drops required entirely", () => {
    const s = inferSchema([{ a: 1 }], { required: "none" });
    expect(s.required).toBeUndefined();
  });
  it("--all-required marks every key required", () => {
    const s = inferSchema([{ a: 1 }, { b: 2 }], { required: "all" });
    expect(s.required!.sort()).toEqual(["a", "b"]);
  });
  it("recurses into nested objects", () => {
    const s = inferNode([{ addr: { city: "KTM", zip: 44600 } }]);
    const addr = s.properties!.addr!;
    expect(addr.type).toBe("object");
    expect(addr.properties!.city!.type).toBe("string");
    expect(addr.properties!.zip!.type).toBe("integer");
  });
  it("unifies a scalar type that differs across samples", () => {
    const s = inferSchema([{ v: 1 }, { v: "x" }]);
    expect(s.properties!.v!.type).toEqual(["integer", "string"]);
  });
});

describe("array inference", () => {
  it("unifies item schemas across all arrays", () => {
    const s = inferNode([[1, 2], [3]]);
    expect(s.type).toBe("array");
    expect((s.items as { type: string }).type).toBe("integer");
  });
  it("gives empty arrays permissive items", () => {
    const s = inferNode([[]]);
    expect(s.items).toEqual({});
  });
  it("unifies arrays of mixed scalars", () => {
    const s = inferNode([[1, "a"]]);
    expect((s.items as { type: string[] }).type).toEqual(["integer", "string"]);
  });
  it("uses anyOf when objects and scalars mix", () => {
    const s = inferNode([[{ a: 1 }, 5]]);
    expect(Array.isArray((s.items as { anyOf: unknown[] }).anyOf)).toBe(true);
  });
});

describe("enum detection", () => {
  it("detects an enum at the threshold", () => {
    const s = inferNode(["a", "b", "a", "b"], { enumThreshold: 2 });
    expect(s.enum).toEqual(["a", "b"]);
  });
  it("does not detect an enum above the threshold", () => {
    const s = inferNode(["a", "b", "c"], { enumThreshold: 2 });
    expect(s.enum).toBeUndefined();
  });
  it("is disabled by default (threshold 0)", () => {
    const s = inferNode(["a", "b"]);
    expect(s.enum).toBeUndefined();
  });
  it("detects numeric enums", () => {
    const s = inferNode([1, 2, 1], { enumThreshold: 3 });
    expect(s.enum).toEqual([1, 2]);
  });
});

describe("format detection", () => {
  const fmt = (vals: string[]): string | undefined => inferNode(vals).format;
  it("detects email", () => expect(fmt(["a@x.com", "b@y.org"])).toBe("email"));
  it("detects date-time", () => expect(fmt(["2020-01-01T00:00:00Z"])).toBe("date-time"));
  it("detects date", () => expect(fmt(["2020-01-01"])).toBe("date"));
  it("detects uuid", () =>
    expect(fmt(["123e4567-e89b-12d3-a456-426614174000"])).toBe("uuid"));
  it("detects uri", () => expect(fmt(["https://a.com/x"])).toBe("uri"));
  it("detects ipv4", () => expect(fmt(["127.0.0.1", "10.0.0.2"])).toBe("ipv4"));
  it("emits no format for plain strings", () =>
    expect(fmt(["hello world"])).toBeUndefined());
  it("requires ALL samples to match a format", () =>
    expect(fmt(["a@x.com", "not-an-email"])).toBeUndefined());
});

describe("root schema", () => {
  it("declares draft-07 by default and honours title", () => {
    const s = inferSchema([{ a: 1 }], { title: "Thing" });
    expect(s.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(s.title).toBe("Thing");
  });
  it("can suppress the $schema declaration", () => {
    expect(inferSchema([1], { declareDraft: false }).$schema).toBeUndefined();
  });
});

describe("prototype pollution safety", () => {
  it("does not pollute Object.prototype from a __proto__ key", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}}');
    inferSchema([evil]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
