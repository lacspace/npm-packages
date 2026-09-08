import { test, expect } from "vitest";
import {
  contains,
  notContains,
  matchesRegex,
  exactMatch,
  jsonValid,
  matchesSchema,
  levenshteinSimilarity,
  cosineSimilarityScore,
  keywordCoverage,
  lengthWithin,
  jsonPathEquals,
} from "./index";
import type { EmbedFn } from "./index";

test("contains: happy and fail", () => {
  const ok = contains("the quick brown fox", "quick");
  expect(ok.passed).toBe(true);
  expect(ok.score).toBe(1);
  const bad = contains("the quick brown fox", "lazy");
  expect(bad.passed).toBe(false);
  expect(bad.score).toBe(0);
  // case-insensitive
  expect(contains("HELLO", "hello", { caseInsensitive: true }).passed).toBe(true);
});

test("notContains: inverts contains", () => {
  expect(notContains("safe output", "error").passed).toBe(true);
  expect(notContains("an error happened", "error").passed).toBe(false);
});

test("matchesRegex: string and RegExp, happy and fail", () => {
  expect(matchesRegex("order #12345", /#\d{5}/).passed).toBe(true);
  expect(matchesRegex("order #12345", "#\\d{5}").passed).toBe(true);
  expect(matchesRegex("no digits", /#\d{5}/).passed).toBe(false);
  // a global regex still evaluates deterministically
  const g = /a/g;
  expect(matchesRegex("aaa", g).passed).toBe(true);
  expect(matchesRegex("aaa", g).passed).toBe(true);
});

test("exactMatch: trim and case options", () => {
  expect(exactMatch("yes", "yes").passed).toBe(true);
  expect(exactMatch("  yes  ", "yes", { trim: true }).passed).toBe(true);
  expect(exactMatch("YES", "yes", { caseInsensitive: true }).passed).toBe(true);
  expect(exactMatch("yes", "no").passed).toBe(false);
});

test("jsonValid: valid and invalid", () => {
  expect(jsonValid('{"a":1}').passed).toBe(true);
  expect(jsonValid("not json").passed).toBe(false);
  expect(jsonValid("{a:1}").passed).toBe(false);
});

test("matchesSchema: passes valid object, fails on type/required", () => {
  const schema = {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, minLength: 1 },
      age: { type: "integer" as const, minimum: 0 },
      role: { type: "string" as const, enum: ["admin", "user"] },
    },
    required: ["name", "age"],
    additionalProperties: false,
  };
  const good = matchesSchema('{"name":"Ada","age":36,"role":"admin"}', schema);
  expect(good.passed).toBe(true);
  expect(good.score).toBe(1);

  const missing = matchesSchema('{"age":36}', schema);
  expect(missing.passed).toBe(false);
  expect(missing.score).toBeLessThan(1);
  expect((missing.details as { errors: string[] }).errors.length).toBeGreaterThan(0);

  const wrongType = matchesSchema('{"name":"Ada","age":"old"}', schema);
  expect(wrongType.passed).toBe(false);

  const badEnum = matchesSchema('{"name":"Ada","age":1,"role":"root"}', schema);
  expect(badEnum.passed).toBe(false);

  const extra = matchesSchema('{"name":"Ada","age":1,"x":true}', schema);
  expect(extra.passed).toBe(false);

  // invalid JSON fails outright
  expect(matchesSchema("nope", schema).passed).toBe(false);
});

test("matchesSchema: array items and length", () => {
  const schema = { type: "array" as const, items: { type: "number" as const }, minItems: 2 };
  expect(matchesSchema("[1,2,3]", schema).passed).toBe(true);
  expect(matchesSchema("[1]", schema).passed).toBe(false);
  expect(matchesSchema('[1,"two"]', schema).passed).toBe(false);
});

test("levenshteinSimilarity: identical, close, far", () => {
  expect(levenshteinSimilarity("kitten", "kitten").score).toBe(1);
  const close = levenshteinSimilarity("kitten", "sitten");
  expect(close.score).toBeCloseTo(5 / 6, 5);
  expect(close.passed).toBe(true);
  const far = levenshteinSimilarity("kitten", "xyz", { threshold: 0.8 });
  expect(far.passed).toBe(false);
  expect(levenshteinSimilarity("", "").score).toBe(1);
});

test("cosineSimilarityScore: token-overlap fallback (sync)", () => {
  const same = cosineSimilarityScore("the cat sat", "the cat sat");
  expect(same.score).toBeCloseTo(1, 5);
  expect(same.passed).toBe(true);
  const overlap = cosineSimilarityScore("the cat sat on the mat", "a cat on a mat", { threshold: 0.4 });
  expect(overlap.score).toBeGreaterThan(0);
  expect(overlap.score).toBeLessThan(1);
  const none = cosineSimilarityScore("apples oranges", "quantum physics");
  expect(none.score).toBe(0);
  expect(none.passed).toBe(false);
});

test("cosineSimilarityScore: injected embedder (async)", async () => {
  // Fake, deterministic embedder — identical vectors => cosine 1 => mapped 1.
  const embed: EmbedFn = async (texts) =>
    texts.map((t) => (t.includes("dog") ? [1, 0, 0] : [0, 1, 0]));
  const same = await cosineSimilarityScore("a dog", "the dog", embed, { threshold: 0.9 });
  expect(same.score).toBeCloseTo(1, 5);
  expect(same.passed).toBe(true);
  expect((same.details as { mode: string }).mode).toBe("embedding");

  const orthogonal = await cosineSimilarityScore("a dog", "a cat", embed, { threshold: 0.9 });
  // orthogonal vectors -> cosine 0 -> mapped to 0.5
  expect(orthogonal.score).toBeCloseTo(0.5, 5);
  expect(orthogonal.passed).toBe(false);
});

test("keywordCoverage: full, partial, threshold", () => {
  const full = keywordCoverage("refund policy and shipping details", ["refund", "shipping"]);
  expect(full.score).toBe(1);
  expect(full.passed).toBe(true);

  const partial = keywordCoverage("only refund here", ["refund", "shipping"]);
  expect(partial.score).toBe(0.5);
  expect(partial.passed).toBe(false); // default threshold is 1 (all)
  expect((partial.details as { missing: string[] }).missing).toEqual(["shipping"]);

  const relaxed = keywordCoverage("only refund here", ["refund", "shipping"], { threshold: 0.5 });
  expect(relaxed.passed).toBe(true);
});

test("lengthWithin: chars and words", () => {
  expect(lengthWithin("hello", { min: 1, max: 10 }).passed).toBe(true);
  expect(lengthWithin("hello", { max: 3 }).passed).toBe(false);
  expect(lengthWithin("", { min: 1 }).passed).toBe(false);
  expect(lengthWithin("one two three", { max: 3, unit: "words" }).passed).toBe(true);
  expect(lengthWithin("one two three four", { max: 3, unit: "words" }).passed).toBe(false);
});

test("jsonPathEquals: dot, bracket, object input, mismatch", () => {
  const doc = '{"user":{"name":"Ada","roles":["admin","user"]}}';
  expect(jsonPathEquals(doc, "user.name", "Ada").passed).toBe(true);
  expect(jsonPathEquals(doc, "user.roles[0]", "admin").passed).toBe(true);
  expect(jsonPathEquals(doc, "$.user.roles.1", "user").passed).toBe(true);
  expect(jsonPathEquals(doc, "user.name", "Bob").passed).toBe(false);
  expect(jsonPathEquals(doc, "user.missing", "x").passed).toBe(false);
  // already-parsed object input
  expect(jsonPathEquals({ a: { b: 2 } }, "a.b", 2).passed).toBe(true);
  // deep-equal on arrays/objects
  expect(jsonPathEquals(doc, "user.roles", ["admin", "user"]).passed).toBe(true);
  // invalid json string
  expect(jsonPathEquals("nope", "a", 1).passed).toBe(false);
});
