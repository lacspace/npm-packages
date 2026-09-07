import { describe, it, expect } from "vitest";
import { diff, isEqual } from "./diff.js";
import { merge, parseArrayStrategy } from "./merge.js";
import { formatJson, getPath, parsePath } from "./format.js";

describe("diff", () => {
  it("detects added / removed / changed", () => {
    const d = diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    expect(d).toContainEqual({ kind: "changed", path: "b", before: 2, after: 3 });
    expect(d).toContainEqual({ kind: "added", path: "c", after: 4 });
  });
  it("removed leaf", () => {
    const d = diff({ a: 1, b: 2 }, { a: 1 });
    expect(d).toContainEqual({ kind: "removed", path: "b", before: 2 });
  });
  it("nested + array paths", () => {
    const d = diff({ u: { tags: ["a", "b"] } }, { u: { tags: ["a", "c"] } });
    expect(d).toContainEqual({ kind: "changed", path: "u.tags[1]", before: "b", after: "c" });
  });
  it("no differences", () => {
    expect(diff({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
    expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
  });
});

describe("merge", () => {
  it("deep-merges objects", () => {
    expect(merge([{ a: { x: 1 } }, { a: { y: 2 }, b: 3 }])).toEqual({ a: { x: 1, y: 2 }, b: 3 });
  });
  it("replace is the default array strategy", () => {
    expect(merge([{ xs: [1, 2] }, { xs: [3] }])).toEqual({ xs: [3] });
  });
  it("concat arrays", () => {
    expect(merge([{ xs: [1, 2] }, { xs: [3] }], { array: { mode: "concat" } })).toEqual({ xs: [1, 2, 3] });
  });
  it("by-key merges array items", () => {
    const a = { items: [{ id: 1, n: "a" }, { id: 2, n: "b" }] };
    const b = { items: [{ id: 2, n: "B", extra: true }, { id: 3, n: "c" }] };
    expect(merge([a, b], { array: { mode: "by-key", key: "id" } })).toEqual({
      items: [{ id: 1, n: "a" }, { id: 2, n: "B", extra: true }, { id: 3, n: "c" }],
    });
  });
  it("merges N documents left to right", () => {
    expect(merge([{ a: 1 }, { a: 2 }, { a: 3, b: 1 }])).toEqual({ a: 3, b: 1 });
  });
  it("does not pollute the prototype", () => {
    const evil = JSON.parse('{"__proto__":{"pwned":true}}');
    const res = merge([{ ok: 1 }, evil]) as Record<string, unknown>;
    expect(({} as Record<string, unknown>)["pwned"]).toBeUndefined();
    expect(res["ok"]).toBe(1);
  });
  it("parses array strategy flags", () => {
    expect(parseArrayStrategy("concat")).toEqual({ mode: "concat" });
    expect(parseArrayStrategy(undefined, "id")).toEqual({ mode: "by-key", key: "id" });
  });
});

describe("format helpers", () => {
  it("pretty and minify", () => {
    expect(formatJson({ a: 1 }, { minify: true })).toBe('{"a":1}');
    expect(formatJson({ b: 1, a: 2 }, { sortKeys: true, minify: true })).toBe('{"a":2,"b":1}');
  });
  it("getPath resolves dotted/bracket paths", () => {
    const d = { a: { b: [{ c: 9 }] } };
    expect(getPath(d, ".a.b[0].c")).toBe(9);
    expect(getPath(d, "a.b[0].c")).toBe(9);
    expect(getPath(d, ".a.z")).toBeUndefined();
  });
  it("parsePath tokenizes", () => {
    expect(parsePath(".a.b[0]")).toEqual(["a", "b", 0]);
    expect(parsePath('users["a b"]')).toEqual(["users", "a b"]);
  });
});
