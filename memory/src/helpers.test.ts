import { test, expect } from "vitest";
import {
  trimToTokenBudget,
  estimateMessageTokens,
  windowMessages,
  defaultCountTokens,
  DEFAULT_CHARS_PER_TOKEN,
} from "./index";
import type { Message } from "./index";

const msgs = (...pairs: [Message["role"], string][]): Message[] =>
  pairs.map(([role, content]) => ({ role, content }));

test("defaultCountTokens is a chars/4 heuristic", () => {
  expect(DEFAULT_CHARS_PER_TOKEN).toBe(4);
  expect(defaultCountTokens("12345678")).toBe(2);
  expect(defaultCountTokens("abc")).toBe(1); // ceil(3/4)
  expect(defaultCountTokens("")).toBe(0);
});

test("estimateMessageTokens sums content + per-message overhead", () => {
  const list = msgs(["user", "aaaa"], ["assistant", "bbbb"]);
  // each: ceil(4/4)=1 token + 4 overhead => 5; two => 10
  expect(estimateMessageTokens(list)).toBe(10);
});

test("estimateMessageTokens honours an injected counter", () => {
  const list = msgs(["user", "hello world"]);
  const wordCount = (t: string) => t.trim().split(/\s+/).length;
  // 2 words + 4 overhead
  expect(estimateMessageTokens(list, wordCount)).toBe(6);
});

test("windowMessages keeps the newest N and preserves order", () => {
  const list = msgs(
    ["user", "1"],
    ["assistant", "2"],
    ["user", "3"],
    ["assistant", "4"],
  );
  const w = windowMessages(list, 2);
  expect(w.map((m) => m.content)).toEqual(["3", "4"]);
});

test("windowMessages keeps system messages for free (not counted)", () => {
  const list = msgs(
    ["system", "S"],
    ["user", "1"],
    ["assistant", "2"],
    ["user", "3"],
  );
  const w = windowMessages(list, 1);
  expect(w.map((m) => m.content)).toEqual(["S", "3"]);
});

test("windowMessages can drop system when keepSystem=false", () => {
  const list = msgs(["system", "S"], ["user", "1"], ["assistant", "2"]);
  const w = windowMessages(list, 1, false);
  expect(w.map((m) => m.content)).toEqual(["2"]);
});

test("windowMessages does not mutate its input", () => {
  const list = msgs(["user", "1"], ["user", "2"], ["user", "3"]);
  windowMessages(list, 1);
  expect(list.length).toBe(3);
});

test("trimToTokenBudget drops oldest non-system to fit a token budget", () => {
  const list = msgs(
    ["system", "sys"],
    ["user", "aaaaaaaa"],
    ["assistant", "bbbbbbbb"],
    ["user", "cccccccc"],
  );
  const kept = trimToTokenBudget(list, { maxTokens: 20, keepLast: 0 });
  expect(kept[0]!.role).toBe("system"); // system preserved
  expect(kept[kept.length - 1]!.content).toBe("cccccccc"); // newest preserved
  expect(kept.length).toBeLessThan(list.length);
  expect(estimateMessageTokens(kept)).toBeLessThanOrEqual(20);
  expect(list.length).toBe(4); // input not mutated
});

test("trimToTokenBudget respects keepLast (never drops newest turns)", () => {
  const list = msgs(
    ["user", "aaaaaaaaaaaa"],
    ["user", "bbbbbbbbbbbb"],
    ["user", "cccccccccccc"],
  );
  const kept = trimToTokenBudget(list, { maxTokens: 1, keepLast: 2 });
  // budget is tiny but the last 2 are protected
  expect(kept.map((m) => m.content)).toEqual(["bbbbbbbbbbbb", "cccccccccccc"]);
});

test("trimToTokenBudget enforces a message-count budget", () => {
  const list = msgs(
    ["user", "1"],
    ["assistant", "2"],
    ["user", "3"],
    ["assistant", "4"],
    ["user", "5"],
  );
  const kept = trimToTokenBudget(list, { maxMessages: 2 });
  expect(kept.map((m) => m.content)).toEqual(["4", "5"]);
});

test("trimToTokenBudget with a fake exact counter trims by real tokens", () => {
  const list = msgs(
    ["user", "one two three"],
    ["assistant", "four five"],
    ["user", "six"],
  );
  const wordCount = (t: string) => t.trim().split(/\s+/).length;
  const kept = trimToTokenBudget(list, {
    maxTokens: 8,
    countTokens: wordCount,
    keepLast: 1,
  });
  expect(estimateMessageTokens(kept, wordCount)).toBeLessThanOrEqual(8);
  expect(kept[kept.length - 1]!.content).toBe("six");
});

test("trimToTokenBudget returns everything when it already fits", () => {
  const list = msgs(["user", "hi"], ["assistant", "yo"]);
  const kept = trimToTokenBudget(list, { maxTokens: 10_000 });
  expect(kept.map((m) => m.content)).toEqual(["hi", "yo"]);
});
