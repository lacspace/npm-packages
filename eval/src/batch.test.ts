import { test, expect } from "vitest";
import { runEval, contains, lengthWithin, keywordCoverage, judgeScorer } from "./index";
import type { EvalCase, JudgeFn } from "./index";

test("runEval: passRate and averageScore math", async () => {
  const cases: EvalCase[] = [
    { name: "a", output: "refund issued", scorers: [(o) => contains(o, "refund")] }, // pass, 1
    { name: "b", output: "shipping soon", scorers: [(o) => contains(o, "refund")] }, // fail, 0
    { name: "c", output: "refund and refund", scorers: [(o) => contains(o, "refund"), (o) => contains(o, "refund")] }, // pass, 1
    { name: "d", output: "half", scorers: [(o) => contains(o, "half"), (o) => contains(o, "nope")] }, // fail, 0.5
  ];
  const report = await runEval(cases);
  expect(report.results).toHaveLength(4);
  // 2 of 4 cases fully passed
  expect(report.passRate).toBe(0.5);
  // average of case scores: (1 + 0 + 1 + 0.5) / 4 = 0.625
  expect(report.averageScore).toBeCloseTo(0.625, 5);
  expect(report.passed).toBe(false);
  // carries case metadata through
  expect(report.results[0]!.name).toBe("a");
});

test("runEval: all pass => passed true, passRate 1", async () => {
  const cases: EvalCase[] = [
    { output: "hello world", scorers: [(o) => contains(o, "hello"), (o) => lengthWithin(o, { max: 50 })] },
    { output: "another one", scorers: [(o) => keywordCoverage(o, ["another"])] },
  ];
  const report = await runEval(cases);
  expect(report.passRate).toBe(1);
  expect(report.averageScore).toBe(1);
  expect(report.passed).toBe(true);
});

test("runEval: empty suite is vacuously passing", async () => {
  const report = await runEval([]);
  expect(report.passRate).toBe(1);
  expect(report.averageScore).toBe(1);
  expect(report.passed).toBe(true);
  expect(report.results).toEqual([]);
});

test("runEval: works with injected judge scorer, sequential mode", async () => {
  const fake: JudgeFn = async () => "Score: 7/10";
  const cases: EvalCase[] = [
    { input: "q1", output: "a1", expected: "gold", scorers: [judgeScorer({ criteria: "quality", judge: fake })] },
    { input: "q2", output: "a2", scorers: [judgeScorer({ criteria: "quality", judge: fake, threshold: 0.8 })] },
  ];
  const report = await runEval(cases, { parallel: false });
  expect(report.results[0]!.passed).toBe(true); // 0.7 >= 0.6
  expect(report.results[1]!.passed).toBe(false); // 0.7 < 0.8
  expect(report.results[0]!.expected).toBe("gold");
  expect(report.passRate).toBe(0.5);
});
