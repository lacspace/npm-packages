import { test, expect } from "vitest";
import { normalizeHeaders, mergeHeaders } from "./headers";

test("normalizeHeaders handles records, arrays and Headers", () => {
  expect(normalizeHeaders({ "Content-Type": "application/json" })).toEqual({ "content-type": "application/json" });
  expect(normalizeHeaders([["X-A", "1"], ["X-B", "2"]])).toEqual({ "x-a": "1", "x-b": "2" });
  expect(normalizeHeaders(new Headers({ Accept: "text/html" }))).toEqual({ accept: "text/html" });
  expect(normalizeHeaders(undefined)).toEqual({});
});

test("mergeHeaders is case-insensitive last-one-wins", () => {
  const merged = mergeHeaders({ "Content-Type": "text/plain" }, { "content-type": "application/json", "X-Trace": "abc" });
  expect(merged).toEqual({ "content-type": "application/json", "x-trace": "abc" });
});

test("mergeHeaders skips undefined sources and drops null values", () => {
  expect(mergeHeaders(undefined, { a: "1" }, undefined)).toEqual({ a: "1" });
  expect(normalizeHeaders({ a: "1", b: null as unknown as string })).toEqual({ a: "1" });
});
