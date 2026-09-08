import { test, expect } from "vitest";
import {
  contextUsage,
  remainingContext,
  willReplyFit,
  countTokens,
  countMessageTokens,
  MODELS,
  type ChatMessage,
} from "./index";

test("contextUsage reports used/remaining/fraction for a string", () => {
  const text = "hello world, this is a short prompt";
  const u = contextUsage(text, "gpt-3.5-turbo");
  const window = MODELS["gpt-3.5-turbo"].contextWindow;
  expect(u.window).toBe(window);
  expect(u.used).toBe(countTokens(text, "gpt-3.5-turbo"));
  expect(u.remaining).toBe(window - u.used);
  expect(u.fits).toBe(true);
  expect(u.fraction).toBeCloseTo(u.used / window, 10);
});

test("contextUsage counts message overhead for a message list", () => {
  const msgs: ChatMessage[] = [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hi there" },
  ];
  const u = contextUsage(msgs, "gpt-4o");
  expect(u.used).toBe(countMessageTokens(msgs, "gpt-4o"));
});

test("contextUsage signals overflow with negative remaining and fits:false", () => {
  const window = MODELS["gpt-3.5-turbo"].contextWindow;
  const huge = "token ".repeat(window * 2);
  const u = contextUsage(huge, "gpt-3.5-turbo");
  expect(u.fits).toBe(false);
  expect(u.remaining).toBeLessThan(0);
  expect(u.fraction).toBeGreaterThan(1);
});

test("remainingContext clamps overflow to 0 and is positive when there is room", () => {
  const window = MODELS["gpt-3.5-turbo"].contextWindow;
  expect(remainingContext("just a little text", "gpt-3.5-turbo")).toBeGreaterThan(0);
  expect(remainingContext("word ".repeat(window * 2), "gpt-3.5-turbo")).toBe(0);
});

test("willReplyFit accounts for the reserved reply size", () => {
  const window = MODELS["gpt-3.5-turbo"].contextWindow;
  const prompt = "short prompt";
  expect(willReplyFit(prompt, 100, "gpt-3.5-turbo")).toBe(true);
  // A reply larger than the whole window can never fit.
  expect(willReplyFit(prompt, window + 1, "gpt-3.5-turbo")).toBe(false);
  // Negative reply size is treated as 0.
  expect(willReplyFit(prompt, -50, "gpt-3.5-turbo")).toBe(true);
});
