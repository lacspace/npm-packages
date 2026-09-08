import { test, expect } from "vitest";
import { buildQuery, parseQuery } from "./query";

test("buildQuery drops null/undefined and encodes scalars", () => {
  expect(buildQuery({ a: 1, b: "x", c: true, d: null, e: undefined })).toBe("a=1&b=x&c=true");
});

test("buildQuery arrayFormat: repeat / comma / brackets", () => {
  expect(buildQuery({ tags: ["a", "b"] })).toBe("tags=a&tags=b");
  expect(buildQuery({ tags: ["a", "b"] }, { arrayFormat: "comma" })).toBe("tags=a%2Cb");
  expect(buildQuery({ tags: ["a", "b"] }, { arrayFormat: "brackets" })).toBe("tags%5B%5D=a&tags%5B%5D=b");
});

test("buildQuery leadingQuestionMark and empty input", () => {
  expect(buildQuery({ a: 1 }, { leadingQuestionMark: true })).toBe("?a=1");
  expect(buildQuery({})).toBe("");
  expect(buildQuery(undefined)).toBe("");
  expect(buildQuery({ a: null }, { leadingQuestionMark: true })).toBe("");
});

test("parseQuery round-trips repeat and brackets into arrays", () => {
  expect(parseQuery("?a=1&b=x")).toEqual({ a: "1", b: "x" });
  expect(parseQuery("tags=a&tags=b")).toEqual({ tags: ["a", "b"] });
  expect(parseQuery("tags[]=a&tags[]=b")).toEqual({ tags: ["a", "b"] });
  expect(parseQuery("")).toEqual({});
});
