import { test, expect } from "vitest";
import {
  estimatePromptCost,
  compareModelCost,
  cheapestModel,
  countTokens,
  estimateCost,
  modelInfo,
  MODELS,
} from "./index";

test("estimatePromptCost counts the text then prices it", () => {
  const prompt = "Summarise this document in three bullet points.";
  const r = estimatePromptCost(prompt, "gpt-4o", { outputTokens: 200 });
  const tokens = countTokens(prompt, "gpt-4o");
  expect(r.breakdown.inputTokens).toBe(tokens);
  expect(r.breakdown.outputTokens).toBe(200);
  expect(r.usd).toBeCloseTo(
    estimateCost({ model: "gpt-4o", inputTokens: tokens, outputTokens: 200 }).usd,
    9,
  );
});

test("estimatePromptCost defaults output tokens to 0", () => {
  const r = estimatePromptCost("hello", "gpt-4o");
  expect(r.breakdown.outputTokens).toBe(0);
});

test("compareModelCost sorts cheapest first across the default model set", () => {
  const ranked = compareModelCost({ inputTokens: 1_000_000, outputTokens: 500_000 });
  expect(ranked.length).toBe(Object.keys(MODELS).length);
  for (let i = 1; i < ranked.length; i++) {
    expect(ranked[i]!.usd).toBeGreaterThanOrEqual(ranked[i - 1]!.usd);
  }
  // The absolute cheapest should be no pricier than gpt-4o for the same load.
  const gpt4o = estimateCost({
    model: "gpt-4o",
    inputTokens: 1_000_000,
    outputTokens: 500_000,
  }).usd;
  expect(ranked[0]!.usd).toBeLessThanOrEqual(gpt4o);
});

test("compareModelCost honours a custom model list and resolves aliases", () => {
  const ranked = compareModelCost({ inputTokens: 1000 }, ["gpt-4o", "sonnet", "opus"]);
  expect(ranked.map((r) => r.model)).toHaveLength(3);
  // opus is the priciest input token in that set.
  const opus = ranked.find((r) => r.model === "opus")!;
  expect(opus.estimate.breakdown.inputPricePerM).toBe(modelInfo("opus").input);
});

test("cheapestModel returns the lowest-cost option, or undefined for an empty set", () => {
  const best = cheapestModel({ inputTokens: 10_000, outputTokens: 10_000 });
  expect(best).toBeDefined();
  const all = compareModelCost({ inputTokens: 10_000, outputTokens: 10_000 });
  expect(best!.usd).toBe(all[0]!.usd);
  expect(cheapestModel({ inputTokens: 1 }, [])).toBeUndefined();
});

test("new 1.1.0 model presets and aliases resolve", () => {
  expect(MODELS["gpt-4.1"]).toBeDefined();
  expect(MODELS["claude-sonnet-4"]).toBeDefined();
  expect(MODELS["gemini-2.5-flash"]).toBeDefined();
  expect(modelInfo("claude-3-7-sonnet-latest")).toBe(MODELS["claude-3-7-sonnet"]);
  expect(modelInfo("o4-mini-2025-04-16")).toBe(MODELS["o4-mini"]);
  expect(modelInfo("sonnet-4")).toBe(MODELS["claude-sonnet-4"]);
  expect(modelInfo("gemini-2.5-pro-latest").family).toBe("gemini");
});
