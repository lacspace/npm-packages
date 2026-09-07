import { describe, it, expect } from "vitest";
import { flatten, unflatten, compareKeys, sortFlat } from "./flatten.js";

describe("flatten", () => {
  it("flattens nested objects to dotted keys", () => {
    expect(flatten({ a: { b: { c: "x" } }, d: "y" })).toEqual({ "a.b.c": "x", d: "y" });
  });

  it("flattens arrays with numeric segments", () => {
    expect(flatten({ items: ["a", "b"] })).toEqual({ "items.0": "a", "items.1": "b" });
  });

  it("keeps non-string scalars", () => {
    expect(flatten({ n: 1, b: true, z: null })).toEqual({ n: 1, b: true, z: null });
  });

  it("drops empty objects and arrays", () => {
    expect(flatten({ a: {}, b: [], c: "x" })).toEqual({ c: "x" });
  });
});

describe("unflatten", () => {
  it("rebuilds nested objects", () => {
    expect(unflatten({ "a.b.c": "x", d: "y" })).toEqual({ a: { b: { c: "x" } }, d: "y" });
  });

  it("rebuilds arrays from consecutive integer keys", () => {
    expect(unflatten({ "items.0": "a", "items.1": "b" })).toEqual({ items: ["a", "b"] });
  });

  it("keeps non-array objects when keys are not 0..n-1", () => {
    expect(unflatten({ "m.1": "a", "m.3": "b" })).toEqual({ m: { "1": "a", "3": "b" } });
  });
});

describe("round-trip", () => {
  it("flatten → unflatten preserves typical locale data", () => {
    const data = { nav: { home: "Home", items: ["one", "two"] }, greeting: "Hi {name}", count: 3 };
    expect(unflatten(flatten(data))).toEqual(data);
  });
});

describe("compareKeys / sortFlat", () => {
  it("sorts numeric segments numerically", () => {
    expect(["a.10", "a.2", "a.1"].sort(compareKeys)).toEqual(["a.1", "a.2", "a.10"]);
  });

  it("sortFlat returns keys in sorted order", () => {
    expect(Object.keys(sortFlat({ b: "1", a: "2", "a.c": "3" }))).toEqual(["a", "a.c", "b"]);
  });
});
