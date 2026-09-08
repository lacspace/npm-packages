import { test, expect } from "vitest";
import { approxTokenLength, wordLength, splitText } from "./index";

test("wordLength counts whitespace-delimited words", () => {
  expect(wordLength("")).toBe(0);
  expect(wordLength("   ")).toBe(0);
  expect(wordLength("one")).toBe(1);
  expect(wordLength("one two three")).toBe(3);
  expect(wordLength("  spaced   out  words ")).toBe(3);
});

test("wordLength drives word-budgeted splitText", () => {
  const text = Array.from({ length: 40 }, () => "word").join(" ");
  const cs = splitText(text, { chunkSize: 8, chunkOverlap: 0, lengthFn: wordLength });
  for (const c of cs) expect(wordLength(c.text)).toBeLessThanOrEqual(8);
  expect(cs.length).toBeGreaterThan(1);
});

test("approxTokenLength is 0 for empty and >=1 for any content", () => {
  expect(approxTokenLength("")).toBe(0);
  expect(approxTokenLength("a")).toBeGreaterThanOrEqual(1);
  expect(approxTokenLength("hello")).toBeGreaterThanOrEqual(1);
});

test("approxTokenLength grows with text length", () => {
  const short = approxTokenLength("The quick brown fox.");
  const long = approxTokenLength("The quick brown fox jumps over the lazy dog again and again.");
  expect(long).toBeGreaterThan(short);
});

test("approxTokenLength stays in a sane ballpark (~chars/4)", () => {
  const text = "The quick brown fox jumps over the lazy dog.";
  const est = approxTokenLength(text);
  // Real GPT tokenization is ~10-12 tokens; heuristic should be in range.
  expect(est).toBeGreaterThanOrEqual(6);
  expect(est).toBeLessThanOrEqual(20);
});

test("approxTokenLength counts CJK characters", () => {
  const est = approxTokenLength("你好世界");
  expect(est).toBeGreaterThanOrEqual(2);
});

test("approxTokenLength works as a splitText lengthFn producing token-budget chunks", () => {
  const text = "Sentence one here. ".repeat(40);
  const cs = splitText(text, { chunkSize: 20, chunkOverlap: 0, lengthFn: approxTokenLength });
  for (const c of cs) expect(approxTokenLength(c.text)).toBeLessThanOrEqual(20);
  expect(cs.length).toBeGreaterThan(1);
});
