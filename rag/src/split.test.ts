import { test, expect } from "vitest";
import { simpleSplit, normalizeSplitOutput } from "./index";

test("simpleSplit returns [] for empty/whitespace text", () => {
  expect(simpleSplit("")).toEqual([]);
  expect(simpleSplit("   \n  ")).toEqual([]);
});

test("simpleSplit returns a single trimmed chunk under the budget", () => {
  expect(simpleSplit("  hello world  ", { chunkSize: 100 })).toEqual(["hello world"]);
});

test("simpleSplit packs paragraphs greedily up to chunkSize", () => {
  const text = "aaaa\n\nbbbb\n\ncccc";
  const out = simpleSplit(text, { chunkSize: 10 });
  // "aaaa\n\nbbbb" = 10 chars fits; "cccc" spills to the next chunk.
  expect(out).toEqual(["aaaa\n\nbbbb", "cccc"]);
});

test("simpleSplit hard-windows a single oversized unit", () => {
  const out = simpleSplit("abcdefghij", { chunkSize: 4 });
  expect(out).toEqual(["abcd", "efgh", "ij"]);
});

test("simpleSplit applies overlap when windowing", () => {
  const out = simpleSplit("abcdefgh", { chunkSize: 4, chunkOverlap: 2 });
  expect(out).toEqual(["abcd", "cdef", "efgh", "gh"]);
});

test("simpleSplit validates options", () => {
  expect(() => simpleSplit("x", { chunkSize: 0 })).toThrow(/chunkSize/);
  expect(() => simpleSplit("x", { chunkSize: 5, chunkOverlap: 5 })).toThrow(/overlap/i);
  expect(() => simpleSplit("x", { chunkOverlap: -1 })).toThrow(/overlap/i);
});

test("normalizeSplitOutput handles strings and { text } objects", () => {
  expect(normalizeSplitOutput(["a", "b"])).toEqual(["a", "b"]);
  expect(normalizeSplitOutput([{ text: "a" }, { text: "b" }])).toEqual(["a", "b"]);
});
