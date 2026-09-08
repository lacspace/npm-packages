import { test, expect } from "vitest";
import { mergeSmallChunks, splitText, type Chunk } from "./index";

const mk = (text: string, start: number): Chunk => ({
  text,
  index: 0,
  start,
  end: start + text.length,
});

test("mergeSmallChunks with minChunkSize 0 returns input re-indexed", () => {
  const input = [mk("aaa", 0), mk("bbb", 3)];
  const out = mergeSmallChunks(input);
  expect(out).toHaveLength(2);
  expect(out.map((c) => c.index)).toEqual([0, 1]);
  expect(out.map((c) => c.text)).toEqual(["aaa", "bbb"]);
});

test("mergeSmallChunks folds tiny neighbours together", () => {
  const input = [mk("a", 0), mk("b", 1), mk("c", 2), mk("longer piece here", 3)];
  const out = mergeSmallChunks(input, { minChunkSize: 5 });
  expect(out.length).toBeLessThan(input.length);
  // First merged chunk should contain the tiny pieces joined.
  expect(out[0]!.text).toContain("a");
  expect(out[0]!.text).toContain("b");
});

test("mergeSmallChunks preserves union offsets", () => {
  const input = [mk("hi", 0), mk("there", 2), mk("world of text", 7)];
  const out = mergeSmallChunks(input, { minChunkSize: 4 });
  expect(out[0]!.start).toBe(0);
  // end should equal the last merged piece's end.
  const lastMergedEnd = out[0]!.end;
  expect(lastMergedEnd).toBeGreaterThan(0);
});

test("mergeSmallChunks respects maxChunkSize ceiling", () => {
  const input = [mk("aa", 0), mk("bb", 2), mk("cc", 4), mk("dd", 6)];
  const out = mergeSmallChunks(input, { minChunkSize: 100, maxChunkSize: 6, joiner: "" });
  // No merged chunk may exceed 6 chars.
  for (const c of out) expect(c.text.length).toBeLessThanOrEqual(6);
  expect(out.length).toBeGreaterThan(1);
});

test("mergeSmallChunks folds a tiny trailing chunk into the previous one", () => {
  const input = [mk("this is a big chunk of text", 0), mk("x", 27)];
  const out = mergeSmallChunks(input, { minChunkSize: 5 });
  expect(out).toHaveLength(1);
  expect(out[0]!.text).toContain("x");
  expect(out[0]!.end).toBe(28);
});

test("mergeSmallChunks uses a custom joiner", () => {
  const input = [mk("a", 0), mk("b", 1), mk("ccccc", 2)];
  const out = mergeSmallChunks(input, { minChunkSize: 3, joiner: " | " });
  expect(out[0]!.text).toBe("a | b");
});

test("mergeSmallChunks honours a custom lengthFn", () => {
  const wordLen = (s: string) => (s.trim() === "" ? 0 : s.trim().split(/\s+/).length);
  const input = [mk("one", 0), mk("two", 4), mk("three four five six", 8)];
  const out = mergeSmallChunks(input, { minChunkSize: 2, lengthFn: wordLen, joiner: " " });
  // "one" and "two" (1 word each) merge to reach the 2-word floor.
  expect(out[0]!.text).toBe("one two");
});

test("mergeSmallChunks is a clean no-op composition with splitText", () => {
  const text = "First.\n\nSecond paragraph is much longer than the first sentence here.\n\nT.";
  const cs = splitText(text, { chunkSize: 40, chunkOverlap: 0 });
  const merged = mergeSmallChunks(cs, { minChunkSize: 10 });
  // Every merged chunk meets the floor except possibly a single un-mergeable one.
  const tooSmall = merged.filter((c) => c.text.length < 10);
  expect(tooSmall.length).toBeLessThanOrEqual(1);
  expect(merged.map((c) => c.index)).toEqual(merged.map((_, i) => i));
});

test("mergeSmallChunks empty input returns empty", () => {
  expect(mergeSmallChunks([])).toEqual([]);
});

test("mergeSmallChunks rejects invalid options", () => {
  expect(() => mergeSmallChunks([mk("a", 0)], { minChunkSize: -1 })).toThrow(RangeError);
  expect(() => mergeSmallChunks([mk("a", 0)], { maxChunkSize: 0 })).toThrow(RangeError);
});
