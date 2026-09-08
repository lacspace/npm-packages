import { test, expect } from "vitest";
import {
  countBatch,
  estimateBatchCost,
  countTokens,
  estimateCost,
} from "./index";

test("countBatch returns per-item tokens plus total/max/count", () => {
  const texts = ["hello", "a longer sentence with several words", "x"];
  const b = countBatch(texts, "gpt-4o");
  expect(b.count).toBe(3);
  expect(b.tokens).toEqual(texts.map((t) => countTokens(t, "gpt-4o")));
  expect(b.total).toBe(b.tokens.reduce((a, n) => a + n, 0));
  expect(b.max).toBe(Math.max(...b.tokens));
});

test("countBatch handles an empty batch", () => {
  const b = countBatch([]);
  expect(b).toEqual({ tokens: [], total: 0, max: 0, count: 0 });
});

test("estimateBatchCost sums per-item costs and matches manual pricing", () => {
  const texts = ["one prompt here", "another prompt that is a bit longer"];
  const r = estimateBatchCost(texts, "gpt-4o");
  const manualTokens = texts.map((t) => countTokens(t, "gpt-4o"));
  const manualUsd = manualTokens.reduce(
    (sum, tk) => sum + estimateCost({ model: "gpt-4o", inputTokens: tk }).usd,
    0,
  );
  expect(r.count).toBe(2);
  expect(r.totalInputTokens).toBe(manualTokens.reduce((a, n) => a + n, 0));
  expect(r.totalOutputTokens).toBe(0);
  expect(r.usd).toBeCloseTo(Math.round(manualUsd * 1e6) / 1e6, 9);
  expect(r.items).toHaveLength(2);
});

test("estimateBatchCost applies outputTokensEach to every item", () => {
  const texts = ["a", "b", "c"];
  const r = estimateBatchCost(texts, "gpt-4o", { outputTokensEach: 100 });
  expect(r.totalOutputTokens).toBe(300);
  expect(r.usd).toBeGreaterThan(estimateBatchCost(texts, "gpt-4o").usd);
});

test("estimateBatchCost resolves aliases like the rest of the library", () => {
  const r = estimateBatchCost(["hello world"], "sonnet");
  // sonnet → claude-3-5-sonnet input price 3/1M; cost is positive.
  expect(r.usd).toBeGreaterThan(0);
  expect(r.items[0]!.breakdown.inputPricePerM).toBe(3);
});
