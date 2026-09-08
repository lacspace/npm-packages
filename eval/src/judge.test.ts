import { test, expect } from "vitest";
import { judge, judgeScorer, buildJudgePrompt, parseJudgeReply } from "./index";
import type { JudgeFn } from "./index";

test("parseJudgeReply: tolerant parsing of many shapes", () => {
  expect(parseJudgeReply("Score: 8/10\nReason: solid answer", 10).raw).toBe(8);
  expect(parseJudgeReply("8 / 10", 10).raw).toBe(8);
  expect(parseJudgeReply("I would rate this 7 out of 10.", 10).raw).toBe(7);
  expect(parseJudgeReply("Rating: 4", 5).raw).toBe(4);
  expect(parseJudgeReply("grade = 3.5", 10).raw).toBe(3.5);
  expect(parseJudgeReply("85%", 10).raw).toBeCloseTo(8.5, 5);
  expect(parseJudgeReply("Just a 9 here", 10).raw).toBe(9);
  // out-of-range is clamped
  expect(parseJudgeReply("Score: 99/10", 10).raw).toBe(10);
  expect(parseJudgeReply("Score: -4/10", 10).raw).toBe(0);
  // unparseable => 0
  expect(parseJudgeReply("no number at all", 10).raw).toBe(0);
});

test("parseJudgeReply: extracts a reason", () => {
  const r = parseJudgeReply("Score: 6/10\nReason: minor factual slip", 10);
  expect(r.reason).toBe("minor factual slip");
});

test("judge: scripted fake judge, passes above threshold", async () => {
  const fake: JudgeFn = async () => "Score: 8/10\nReason: accurate and clear";
  const s = await judge({ output: "The capital of France is Paris.", criteria: "factual accuracy", judge: fake });
  expect(s.name).toBe("judge");
  expect(s.score).toBeCloseTo(0.8, 5);
  expect(s.passed).toBe(true);
  expect((s.details as { reason?: string }).reason).toBe("accurate and clear");
});

test("judge: fails below threshold; respects scale and threshold", async () => {
  const fake: JudgeFn = async () => "Score: 2/5 — weak";
  const s = await judge({
    output: "meh",
    criteria: "helpfulness",
    judge: fake,
    scale: 5,
    threshold: 0.6,
  });
  expect(s.score).toBeCloseTo(0.4, 5);
  expect(s.passed).toBe(false);
});

test("judge: injects criteria, rubric, input and reference into the prompt", async () => {
  let captured = "";
  const fake: JudgeFn = async (p) => {
    captured = p;
    return "Score: 10/10";
  };
  await judge({
    output: "OUT",
    criteria: "be concise",
    rubric: "10 = perfect",
    input: "IN",
    reference: "REF",
    judge: fake,
  });
  expect(captured).toContain("be concise");
  expect(captured).toContain("10 = perfect");
  expect(captured).toContain("IN");
  expect(captured).toContain("REF");
  expect(captured).toContain("OUT");
});

test("buildJudgePrompt: honors scale", () => {
  const p = buildJudgePrompt({ output: "x", criteria: "y", judge: async () => "", scale: 100 });
  expect(p).toContain("from 0 to 100");
  expect(p).toContain("Score: <number>/100");
});

test("judgeScorer: curries into a Scorer for scoreAll/runEval", async () => {
  const fake: JudgeFn = async () => "Score: 9/10";
  const scorer = judgeScorer({ criteria: "clarity", judge: fake });
  const s = await scorer("some output");
  expect(s.score).toBeCloseTo(0.9, 5);
  expect(s.passed).toBe(true);
});
