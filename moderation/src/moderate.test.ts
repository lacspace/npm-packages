import { test, expect } from "vitest";
import { moderateText, lexicalModerate, MODERATION_CATEGORIES } from "./moderate";
import type { ModerationResult } from "./types";

test("clean text is not flagged", async () => {
  const r = await moderateText("I really enjoyed the sunny weather today.");
  expect(r.flagged).toBe(false);
  for (const cat of MODERATION_CATEGORIES) {
    expect(r.categories[cat]).toBe(false);
    expect(r.scores[cat]).toBe(0);
  }
});

test("profanity is flagged in the profanity category", async () => {
  const r = await moderateText("this is absolute shit");
  expect(r.flagged).toBe(true);
  expect(r.categories.profanity).toBe(true);
  expect(r.scores.profanity).toBeGreaterThanOrEqual(0.5);
});

test("violence phrasing is flagged", async () => {
  const r = await moderateText("I will kill you");
  expect(r.categories.violence).toBe(true);
  expect(r.flagged).toBe(true);
});

test("self-harm phrasing is flagged", async () => {
  const r = await moderateText("I want to kill myself");
  expect(r.categories["self-harm"]).toBe(true);
});

test("categories option restricts the scan", async () => {
  const r = await moderateText("this is shit", { categories: ["violence"] });
  // profanity present but not scanned -> not flagged
  expect(r.flagged).toBe(false);
  expect(r.scores.profanity).toBeUndefined();
  expect(r.categories.violence).toBe(false);
});

test("threshold controls flagging in the lexical scan", () => {
  const strict = lexicalModerate("this is shit", MODERATION_CATEGORIES, 0.99);
  expect(strict.categories.profanity).toBe(false);
  const loose = lexicalModerate("this is shit", MODERATION_CATEGORIES, 0.1);
  expect(loose.categories.profanity).toBe(true);
});

test("an injected classifier fully replaces the built-in scan", async () => {
  const fakeClassify = async (text: string): Promise<ModerationResult> => ({
    flagged: text.includes("banana"),
    categories: { fruit: text.includes("banana") },
    scores: { fruit: text.includes("banana") ? 1 : 0 },
  });

  const hit = await moderateText("I like banana bread", { classify: fakeClassify });
  expect(hit.flagged).toBe(true);
  expect(hit.categories.fruit).toBe(true);
  // Built-in categories are absent because the injected classifier owns the result.
  expect(hit.categories.profanity).toBeUndefined();

  const miss = await moderateText("plain apple", { classify: fakeClassify });
  expect(miss.flagged).toBe(false);
});

test("lexicalModerate returns a score for every requested category", () => {
  const r = lexicalModerate("hello world");
  expect(Object.keys(r.scores).sort()).toEqual([...MODERATION_CATEGORIES].sort());
});
