import { describe, it, expect } from "vitest";
import { flatten, unflatten, parseFlatKey } from "./flatten.js";
import type { JsonValue } from "./util.js";

describe("flatten", () => {
  it("flattens nested objects with dots", () => {
    expect(flatten({ a: { b: { c: 1 } } })).toEqual({ "a.b.c": 1 });
  });
  it("uses bracket indices for arrays", () => {
    expect(flatten({ a: { b: [1, 2] } })).toEqual({ "a.b[0]": 1, "a.b[1]": 2 });
  });
  it("preserves empty containers as leaves", () => {
    expect(flatten({ a: {}, b: [] })).toEqual({ a: {}, b: [] });
  });
  it("quotes keys that contain the delimiter", () => {
    expect(flatten({ "a.b": 1 })).toEqual({ '["a.b"]': 1 });
  });
  it("honours a custom delimiter", () => {
    expect(flatten({ a: { b: 1 } }, { delimiter: "/" })).toEqual({ "a/b": 1 });
  });
  it("a top-level scalar flattens to the empty key", () => {
    expect(flatten(5 as JsonValue)).toEqual({ "": 5 });
  });
});

describe("unflatten", () => {
  it("rebuilds nested objects", () => {
    expect(unflatten({ "a.b.c": 1 })).toEqual({ a: { b: { c: 1 } } });
  });
  it("rebuilds arrays from bracket indices", () => {
    expect(unflatten({ "a.b[0]": 1, "a.b[1]": 2 })).toEqual({ a: { b: [1, 2] } });
  });
  it("rebuilds a root array", () => {
    expect(unflatten({ "[0]": "x", "[1]": "y" })).toEqual(["x", "y"]);
  });
  it("decodes quoted keys", () => {
    expect(unflatten({ '["a.b"]': 1 })).toEqual({ "a.b": 1 });
  });
  it("refuses prototype-pollution keys", () => {
    expect(() => unflatten({ "__proto__.x": 1 })).toThrow();
  });
});

describe("flatten round-trip", () => {
  const cases: JsonValue[] = [
    { a: { b: [1, 2, { c: 3 }] }, d: "x" },
    { users: [{ id: 1, tags: ["a", "b"] }, { id: 2, tags: [] }] },
    { "weird.key": 1, normal: { nested: true }, empty: {} },
    [1, [2, [3, [4]]]],
  ];
  it.each(cases.map((c, i) => [i, c] as const))("round-trips case %i", (_i, c) => {
    expect(unflatten(flatten(c))).toEqual(c);
  });
  it("round-trips with a custom delimiter", () => {
    const c = { a: { b: { c: 1 } } };
    expect(unflatten(flatten(c, { delimiter: "__" }), { delimiter: "__" })).toEqual(c);
  });
});

describe("parseFlatKey", () => {
  it("tokenizes dotted + bracket keys", () => {
    expect(parseFlatKey("a.b[0].c", ".")).toEqual(["a", "b", 0, "c"]);
    expect(parseFlatKey('["a.b"][2]', ".")).toEqual(["a.b", 2]);
  });
});
