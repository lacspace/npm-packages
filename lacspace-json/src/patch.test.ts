import { describe, it, expect } from "vitest";
import { patch, diffPatch } from "./patch.js";
import type { JsonPatch } from "./patch.js";
import type { JsonValue } from "./util.js";

describe("JSON Patch apply (RFC 6902)", () => {
  it("add to an object", () => {
    expect(patch({ a: 1 }, [{ op: "add", path: "/b", value: 2 }])).toEqual({ a: 1, b: 2 });
  });
  it("add inserts into an array (and '-' appends)", () => {
    expect(patch({ xs: [1, 3] }, [{ op: "add", path: "/xs/1", value: 2 }])).toEqual({ xs: [1, 2, 3] });
    expect(patch({ xs: [1, 2] }, [{ op: "add", path: "/xs/-", value: 3 }])).toEqual({ xs: [1, 2, 3] });
  });
  it("remove a key and an array element", () => {
    expect(patch({ a: 1, b: 2 }, [{ op: "remove", path: "/b" }])).toEqual({ a: 1 });
    expect(patch({ xs: [1, 2, 3] }, [{ op: "remove", path: "/xs/1" }])).toEqual({ xs: [1, 3] });
  });
  it("replace an existing value", () => {
    expect(patch({ a: 1 }, [{ op: "replace", path: "/a", value: 9 }])).toEqual({ a: 9 });
  });
  it("move relocates a value", () => {
    expect(patch({ a: { x: 1 }, b: {} }, [{ op: "move", from: "/a/x", path: "/b/y" }])).toEqual({ a: {}, b: { y: 1 } });
  });
  it("copy duplicates a value", () => {
    expect(patch({ a: 1 }, [{ op: "copy", from: "/a", path: "/b" }])).toEqual({ a: 1, b: 1 });
  });
  it("test passes and fails", () => {
    expect(patch({ a: 1 }, [{ op: "test", path: "/a", value: 1 }])).toEqual({ a: 1 });
    expect(() => patch({ a: 1 }, [{ op: "test", path: "/a", value: 2 }])).toThrow();
  });
  it("replaces the whole document with an empty path", () => {
    expect(patch({ a: 1 }, [{ op: "replace", path: "", value: [1, 2] }])).toEqual([1, 2]);
  });
  it("does not mutate the input", () => {
    const doc = { a: 1 };
    patch(doc, [{ op: "add", path: "/b", value: 2 }]);
    expect(doc).toEqual({ a: 1 });
  });
  it("throws on out-of-range and missing targets", () => {
    expect(() => patch({ xs: [1] }, [{ op: "add", path: "/xs/5", value: 9 }])).toThrow();
    expect(() => patch({ a: 1 }, [{ op: "replace", path: "/z", value: 9 }])).toThrow();
  });
  it("refuses prototype-pollution keys", () => {
    expect(() => patch({}, [{ op: "add", path: "/__proto__", value: { pwned: true } }])).toThrow();
    expect(({} as Record<string, unknown>)["pwned"]).toBeUndefined();
  });
});

describe("diffPatch (generate)", () => {
  const roundtrips = (a: JsonValue, b: JsonValue): void => {
    const p = diffPatch(a, b);
    expect(patch(a, p)).toEqual(b);
  };
  it("emits replace / add / remove for objects", () => {
    const p = diffPatch({ a: 1, b: 2 }, { a: 9, c: 3 });
    expect(p).toContainEqual({ op: "replace", path: "/a", value: 9 });
    expect(p).toContainEqual({ op: "remove", path: "/b" });
    expect(p).toContainEqual({ op: "add", path: "/c", value: 3 });
  });
  it("element-wise ops for same-length arrays", () => {
    expect(diffPatch({ xs: [1, 2, 3] }, { xs: [1, 9, 3] })).toEqual([{ op: "replace", path: "/xs/1", value: 9 }]);
  });
  it("whole-array replace when lengths differ", () => {
    expect(diffPatch({ xs: [1, 2] }, { xs: [1, 2, 3] })).toEqual([{ op: "replace", path: "/xs", value: [1, 2, 3] }]);
  });
  it("empty patch for equal docs", () => {
    expect(diffPatch({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
  });
  it("round-trips a range of shapes", () => {
    roundtrips({ a: 1 }, { a: 2, b: { c: [1, 2] } });
    roundtrips([1, 2, 3], [4, 5]);
    roundtrips({ nested: { x: 1, y: 2 } }, { nested: { y: 3, z: 4 } });
    roundtrips("hello" as JsonValue, 42 as JsonValue);
  });
  it("generated patch is a valid JsonPatch array", () => {
    const p: JsonPatch = diffPatch({ a: 1 }, { a: 2 });
    expect(Array.isArray(p)).toBe(true);
  });
});
