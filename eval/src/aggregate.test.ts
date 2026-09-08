import { test, expect } from "vitest";
import {
  contains,
  lengthWithin,
  keywordCoverage,
  scoreAll,
  weighted,
  allOf,
  anyOf,
} from "./index";
import type { Scorer } from "./index";

test("scoreAll: averages scores and requires all passed", async () => {
  const r = await scoreAll("the refund is processed", [
    (o) => contains(o, "refund"),
    (o) => contains(o, "shipping"), // fails
  ]);
  expect(r.scores).toHaveLength(2);
  expect(r.score).toBe(0.5);
  expect(r.passed).toBe(false);

  const allPass = await scoreAll("the refund is processed", [
    (o) => contains(o, "refund"),
    (o) => lengthWithin(o, { max: 100 }),
  ]);
  expect(allPass.score).toBe(1);
  expect(allPass.passed).toBe(true);
});

test("scoreAll: empty scorers => perfect and passed", async () => {
  const r = await scoreAll("anything", []);
  expect(r.score).toBe(1);
  expect(r.passed).toBe(true);
});

test("weighted: weighted mean of sub-scores", async () => {
  const w: Scorer = weighted([
    { scorer: (o) => keywordCoverage(o, ["a", "b", "c", "d"], { threshold: 0 }), weight: 3 }, // score 0.25
    { scorer: (o) => contains(o, "a"), weight: 1 }, // score 1
  ]);
  const s = await w("a only");
  // (3*0.25 + 1*1) / 4 = 1.75/4 = 0.4375
  expect(s.score).toBeCloseTo(0.4375, 5);
  expect(s.passed).toBe(true); // threshold 0 keyword + contains both pass
});

test("weighted: accepts bare scorers with equal weight", async () => {
  const w = weighted([(o) => contains(o, "x"), (o) => contains(o, "y")]);
  const s = await w("x y");
  expect(s.score).toBe(1);
  expect(s.passed).toBe(true);
});

test("allOf: min score and AND semantics", async () => {
  const s = allOf([
    (o) => keywordCoverage(o, ["a", "b"], { threshold: 0 }), // score 1 here
    (o) => contains(o, "missing"), // 0, fail
  ]);
  const r = await s("a b");
  expect(r.score).toBe(0);
  expect(r.passed).toBe(false);
});

test("anyOf: max score and OR semantics", async () => {
  const s = anyOf([(o) => contains(o, "nope"), (o) => contains(o, "yes")]);
  const r = await s("the answer is yes");
  expect(r.score).toBe(1);
  expect(r.passed).toBe(true);
});
