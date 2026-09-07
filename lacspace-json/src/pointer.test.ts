import { describe, it, expect } from "vitest";
import { pointer, hasPointer, parsePointer, buildPointer, escapePointerToken, unescapePointerToken } from "./pointer.js";

const doc = {
  foo: ["bar", "baz"],
  "": 0,
  "a/b": 1,
  "c%d": 2,
  "e^f": 3,
  "m~n": 8,
  " ": 7,
  obj: { nested: { deep: 42 } },
};

describe("JSON Pointer (RFC 6901)", () => {
  it("empty pointer returns the whole document", () => {
    expect(pointer(doc, "")).toEqual(doc);
  });
  it("resolves object keys and array indices", () => {
    expect(pointer(doc, "/foo")).toEqual(["bar", "baz"]);
    expect(pointer(doc, "/foo/0")).toBe("bar");
    expect(pointer(doc, "/obj/nested/deep")).toBe(42);
  });
  it("handles the RFC's tricky keys", () => {
    expect(pointer(doc, "/")).toBe(0);
    expect(pointer(doc, "/a~1b")).toBe(1);
    expect(pointer(doc, "/m~0n")).toBe(8);
    expect(pointer(doc, "/ ")).toBe(7);
  });
  it("throws on a missing token", () => {
    expect(() => pointer(doc, "/nope")).toThrow();
    expect(() => pointer(doc, "/foo/9")).toThrow();
  });
  it("hasPointer never throws", () => {
    expect(hasPointer(doc, "/foo/1")).toBe(true);
    expect(hasPointer(doc, "/foo/99")).toBe(false);
    expect(hasPointer(doc, "/obj/missing")).toBe(false);
  });
  it("parsePointer unescapes ~1 then ~0", () => {
    expect(parsePointer("/a~1b/m~0n")).toEqual(["a/b", "m~n"]);
    expect(parsePointer("")).toEqual([]);
  });
  it("buildPointer escapes and round-trips", () => {
    expect(buildPointer(["a/b", "m~n", 0])).toBe("/a~1b/m~0n/0");
    expect(parsePointer(buildPointer(["x", "y/z"]))).toEqual(["x", "y/z"]);
  });
  it("token escape helpers", () => {
    expect(escapePointerToken("a/b~c")).toBe("a~1b~0c");
    expect(unescapePointerToken("a~1b~0c")).toBe("a/b~c");
  });
  it("rejects a pointer that does not start with /", () => {
    expect(() => parsePointer("foo")).toThrow();
  });
});
