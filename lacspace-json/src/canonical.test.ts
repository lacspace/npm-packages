import { describe, it, expect } from "vitest";
import { canonicalize, sortKeys } from "./canonical.js";

describe("canonicalize", () => {
  it("sorts object keys deeply", () => {
    expect(canonicalize({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });
  it("is deterministic regardless of input key order", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it("emits minimal whitespace", () => {
    expect(canonicalize({ a: [1, 2] })).toBe('{"a":[1,2]}');
  });
  it("preserves array order (arrays are ordered)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });
  it("handles scalars", () => {
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hi")).toBe('"hi"');
    expect(canonicalize(null)).toBe("null");
  });
});

describe("sortKeys", () => {
  it("returns a deeply key-sorted copy", () => {
    expect(sortKeys({ b: 1, a: { d: 1, c: 2 } })).toEqual({ a: { c: 2, d: 1 }, b: 1 });
  });
  it("does not mutate the input", () => {
    const input = { b: 1, a: 2 };
    sortKeys(input);
    expect(Object.keys(input)).toEqual(["b", "a"]);
  });
});
