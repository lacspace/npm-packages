import { test, expect } from "vitest";
import {
  estimateTokens,
  fitText,
  trimMessages,
  DEFAULT_CHARS_PER_TOKEN,
  prompt,
  messages,
} from "./index";
import type { Message } from "./index";

test("estimateTokens() uses the chars-per-token heuristic", () => {
  expect(DEFAULT_CHARS_PER_TOKEN).toBe(4);
  expect(estimateTokens("12345678")).toBe(2); // 8 chars / 4
  expect(estimateTokens("hello", { charsPerToken: 1 })).toBe(5);
});

test("estimateTokens() accepts a Prompt and a Message[]", () => {
  expect(estimateTokens(prompt("abcd"))).toBe(1);
  const msgs = messages().system("hi").user("there").build();
  // content+role chars per message rounded up, plus overhead
  expect(estimateTokens(msgs, { perMessageOverhead: 0 })).toBeGreaterThan(0);
  expect(estimateTokens(msgs)).toBeGreaterThan(
    estimateTokens(msgs, { perMessageOverhead: 0 }),
  );
});

test("fitText() returns short text unchanged", () => {
  expect(fitText("short", { maxTokens: 100 })).toBe("short");
});

test("fitText() trims from the end by default", () => {
  const text = "abcdefghijklmnop"; // 16 chars
  const out = fitText(text, { maxTokens: 2, ellipsis: "…" }); // budget 8 chars
  expect(out).toBe("abcdefg…");
  expect(estimateTokens(out)).toBeLessThanOrEqual(2);
});

test("fitText() supports start and middle strategies", () => {
  const text = "abcdefghijklmnop";
  expect(fitText(text, { maxTokens: 2, strategy: "start" })).toBe("…jklmnop");
  const mid = fitText(text, { maxTokens: 2, strategy: "middle" });
  expect(mid.startsWith("abcd")).toBe(true);
  expect(mid.includes("…")).toBe(true);
});

test("fitText() with a zero budget yields empty string", () => {
  expect(fitText("anything", { maxTokens: 0 })).toBe("");
});

test("trimMessages() drops oldest non-system messages to fit and keeps system", () => {
  const history: Message[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "aaaaaaaa" },
    { role: "assistant", content: "bbbbbbbb" },
    { role: "user", content: "cccccccc" },
  ];
  const kept = trimMessages(history, { maxTokens: 10, perMessageOverhead: 0 });
  expect(kept[0]!.role).toBe("system"); // system preserved
  expect(kept[kept.length - 1]!.content).toBe("cccccccc"); // newest preserved
  expect(kept.length).toBeLessThan(history.length);
  // input not mutated
  expect(history.length).toBe(4);
});

test("trimMessages() can drop system messages when keepSystem is false", () => {
  const history: Message[] = [
    { role: "system", content: "aaaaaaaaaaaaaaaa" },
    { role: "user", content: "b" },
  ];
  const kept = trimMessages(history, {
    maxTokens: 2,
    keepSystem: false,
    perMessageOverhead: 0,
  });
  expect(kept.some((m) => m.role === "system")).toBe(false);
});
