import { test, expect } from "vitest";
import {
  countTokens,
  countMessageTokens,
  estimateCost,
  fitToBudget,
  budgetMessages,
  willFit,
  splitByTokens,
  modelInfo,
  MODELS,
  type ChatMessage,
} from "./index";

test("countTokens is in the expected ballpark for known strings", () => {
  // Real tokenizers give ~4 and ~10 for these; allow a generous band.
  expect(countTokens("Hello, world!")).toBeGreaterThanOrEqual(3);
  expect(countTokens("Hello, world!")).toBeLessThanOrEqual(6);

  const fox = countTokens("The quick brown fox jumps over the lazy dog.");
  expect(fox).toBeGreaterThanOrEqual(8);
  expect(fox).toBeLessThanOrEqual(13);

  expect(countTokens("")).toBe(0);
});

test("longer paragraph roughly tracks the ~4 chars/token rule", () => {
  const para =
    "Large language models process text as tokens, which are chunks of characters " +
    "that may be whole words or word fragments. Estimating token counts helps you " +
    "budget prompts and predict cost before sending a request to the API.";
  const t = countTokens(para, "gpt-4o");
  const rough = para.length / 4; // ~54
  expect(t).toBeGreaterThan(rough * 0.7);
  expect(t).toBeLessThan(rough * 1.4);
});

test("code strings produce a sensible, non-trivial count", () => {
  const code = `function add(a, b) {\n  return a + b;\n}`;
  const t = countTokens(code);
  expect(t).toBeGreaterThanOrEqual(10);
  expect(t).toBeLessThanOrEqual(30);
});

test("claude family scales up vs gpt for the same text", () => {
  const s = "Estimating tokens without a heavy wasm tokenizer is surprisingly handy.";
  expect(countTokens(s, "claude-3-5-sonnet")).toBeGreaterThan(countTokens(s, "gpt-4o"));
});

test("message overhead adds tokens beyond raw content", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ];
  const raw = countTokens("You are a helpful assistant.") + countTokens("Hello!");
  const withOverhead = countMessageTokens(messages);
  expect(withOverhead).toBeGreaterThan(raw);
  // 2 messages * ~4 overhead + 3 priming = ~11 of overhead on top.
  expect(withOverhead - raw).toBeGreaterThanOrEqual(8);
});

test("modelInfo resolves aliases and dated ids, with a safe fallback", () => {
  expect(modelInfo("sonnet")).toBe(MODELS["claude-3-5-sonnet"]);
  expect(modelInfo("gpt-4o-2024-08-06")).toBe(MODELS["gpt-4o"]);
  expect(modelInfo("gemini-1.5-flash-latest")).toBe(MODELS["gemini-1.5-flash"]);
  // Unknown → default (gpt-4o), never throws.
  expect(modelInfo("totally-made-up-model")).toBe(MODELS["gpt-4o"]);
  expect(modelInfo("claude-9-ultra").family).toBe("claude");
});

test("estimateCost math is correct for gpt-4o and gemini-1.5-flash", () => {
  // gpt-4o: $2.5 / 1M input, $10 / 1M output.
  const a = estimateCost({ model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 500_000 });
  expect(a.usd).toBeCloseTo(2.5 + 5, 6);
  expect(a.breakdown.input).toBeCloseTo(2.5, 6);
  expect(a.breakdown.output).toBeCloseTo(5, 6);

  // gemini-1.5-flash: $0.075 / 1M input.
  const b = estimateCost({ model: "gemini-1.5-flash", inputTokens: 2_000_000 });
  expect(b.usd).toBeCloseTo(0.15, 6);
  expect(b.breakdown.outputTokens).toBe(0);
});

test("fitToBudget returns unchanged text when it already fits", () => {
  const text = "short and sweet";
  const r = fitToBudget(text, 1000);
  expect(r.truncated).toBe(false);
  expect(r.text).toBe(text);
  expect(r.tokens).toBe(countTokens(text));
});

test("fitToBudget truncates for each strategy and stays within budget", () => {
  const long = "word ".repeat(400).trim(); // ~400 words
  for (const strategy of ["end", "start", "middle"] as const) {
    const r = fitToBudget(long, 50, { strategy });
    expect(r.truncated).toBe(true);
    expect(r.tokens).toBeLessThanOrEqual(50);
    expect(r.text).toContain("…");
    expect(r.text.length).toBeLessThan(long.length);
  }
  // "start" keeps the tail, "end" keeps the head.
  const endR = fitToBudget("ALPHA " + "mid ".repeat(200) + "OMEGA", 40, { strategy: "end" });
  expect(endR.text.startsWith("ALPHA")).toBe(true);
  const startR = fitToBudget("ALPHA " + "mid ".repeat(200) + "OMEGA", 40, { strategy: "start" });
  expect(startR.text.trimEnd().endsWith("OMEGA")).toBe(true);
});

test("budgetMessages keeps system + newest and drops the oldest", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "System policy: be concise. ".repeat(3) },
    { role: "user", content: "OLDEST question " + "filler ".repeat(40) },
    { role: "assistant", content: "old answer " + "filler ".repeat(40) },
    { role: "user", content: "middle question " + "filler ".repeat(40) },
    { role: "user", content: "NEWEST question keep me" },
  ];
  const full = countMessageTokens(messages);
  const kept = budgetMessages(messages, Math.floor(full * 0.6), { model: "gpt-4o" });

  // System survives.
  expect(kept.some((m) => m.role === "system")).toBe(true);
  // Newest survives.
  expect(kept[kept.length - 1]!.content).toContain("NEWEST");
  // Oldest user message was dropped.
  expect(kept.some((m) => m.content.includes("OLDEST"))).toBe(false);
  // It actually got smaller and fits.
  expect(kept.length).toBeLessThan(messages.length);
  expect(countMessageTokens(kept)).toBeLessThanOrEqual(Math.floor(full * 0.6));
});

test("budgetMessages never drops a system message even under tight budgets", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "Immutable system prompt that is fairly long. ".repeat(4) },
    { role: "user", content: "hi" },
  ];
  const kept = budgetMessages(messages, 1, { keepSystem: true });
  expect(kept.some((m) => m.role === "system")).toBe(true);
});

test("willFit is true under and false over the context window", () => {
  expect(willFit("just a little text", "gpt-3.5-turbo")).toBe(true);

  const window = MODELS["gpt-3.5-turbo"].contextWindow; // 16385
  const huge = "token ".repeat(window * 2); // way more than the window
  expect(willFit(huge, "gpt-3.5-turbo")).toBe(false);

  // Works with a message list too.
  const msgs: ChatMessage[] = [{ role: "user", content: "hello" }];
  expect(willFit(msgs, "gpt-4o")).toBe(true);
});

test("splitByTokens produces chunks within the per-chunk budget", () => {
  const text = "sentence word ".repeat(300).trim();
  const chunks = splitByTokens(text, 40);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) {
    expect(countTokens(c)).toBeLessThanOrEqual(40);
  }
  // Reassembled words cover the original (no loss besides whitespace normalising).
  const originalWords = text.split(/\s+/).length;
  const chunkedWords = chunks.reduce((n, c) => n + c.split(/\s+/).length, 0);
  expect(chunkedWords).toBeGreaterThanOrEqual(originalWords);
});

test("splitByTokens overlap repeats trailing context and still terminates", () => {
  const text = "one two three four five six seven eight nine ten eleven twelve";
  const chunks = splitByTokens(text, 5, 2);
  expect(chunks.length).toBeGreaterThan(1);
  // Consecutive chunks share at least one word due to overlap.
  const firstWords = chunks[0]!.split(" ");
  const secondWords = chunks[1]!.split(" ");
  const shared = secondWords.some((w) => firstWords.includes(w));
  expect(shared).toBe(true);

  expect(splitByTokens("", 10)).toEqual([]);
  expect(() => splitByTokens("x", 0)).toThrow();
});
