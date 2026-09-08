import { test, expect } from "vitest";
import { createMemory } from "./index";
import type { Message } from "./index";

test("add/addUser/addAssistant/addTool accumulate in order", () => {
  const mem = createMemory();
  mem.addUser("hi");
  mem.addAssistant("hello");
  mem.addTool("42", "call_1");
  const m = mem.messages();
  expect(m.map((x) => x.role)).toEqual(["user", "assistant", "tool"]);
  expect(m[2]!.toolCallId).toBe("call_1");
});

test("add accepts a single message or an array", () => {
  const mem = createMemory();
  mem.add({ role: "user", content: "a" });
  mem.add([
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
  ]);
  expect(mem.messages().map((x) => x.content)).toEqual(["a", "b", "c"]);
});

test("system prompt is pinned first and counted in size", () => {
  const mem = createMemory({ system: "You are helpful." });
  mem.addUser("hi");
  const m = mem.messages();
  expect(m[0]).toEqual({ role: "system", content: "You are helpful." });
  expect(m[1]!.content).toBe("hi");
  expect(mem.size).toBe(2); // system + 1
});

test("history() returns everything ever added, unaffected by pruning", async () => {
  const mem = createMemory({ maxMessages: 2, keepLast: 1 });
  mem.addUser("1");
  mem.addUser("2");
  mem.addUser("3");
  await mem.prune();
  expect(mem.messages().length).toBeLessThanOrEqual(2);
  expect(mem.history().map((x) => x.content)).toEqual(["1", "2", "3"]);
});

test("clear() empties history and window but keeps the system prompt", () => {
  const mem = createMemory({ system: "S" });
  mem.addUser("x");
  mem.clear();
  expect(mem.history()).toEqual([]);
  expect(mem.messages()).toEqual([{ role: "system", content: "S" }]);
});

test("messages() returns copies — mutating them does not corrupt state", () => {
  const mem = createMemory();
  mem.addUser("hi");
  const m = mem.messages();
  m[0]!.content = "changed";
  expect(mem.messages()[0]!.content).toBe("hi");
});

test("toWindow() is a pure trim and does not mutate the memory", () => {
  const mem = createMemory({ keepLast: 1 });
  mem.addUser("aaaaaaaa");
  mem.addAssistant("bbbbbbbb");
  mem.addUser("cccccccc");
  const w = mem.toWindow({ maxTokens: 10 });
  expect(w.length).toBeLessThan(3);
  expect(mem.messages().length).toBe(3); // memory unchanged
});

test("toWindow() keeps the system prompt at the front", () => {
  const mem = createMemory({ system: "SYS", keepLast: 1 });
  mem.addUser("aaaaaaaaaaaa");
  mem.addUser("bbbbbbbbbbbb");
  const w = mem.toWindow({ maxTokens: 12 });
  expect(w[0]!.role).toBe("system");
});

test("prune() drops oldest turns when no summarizer is injected", async () => {
  const mem = createMemory({ maxMessages: 2, keepLast: 1 });
  mem.addUser("1");
  mem.addUser("2");
  mem.addUser("3");
  mem.addUser("4");
  await mem.prune();
  const contents = mem.messages().map((x) => x.content);
  expect(contents).toEqual(["3", "4"]);
});

test("prune() never drops the system prompt or the last keepLast", async () => {
  const mem = createMemory({
    system: "sys",
    maxTokens: 1, // absurdly tight
    keepLast: 2,
  });
  mem.addUser("aaaaaaaa");
  mem.addUser("bbbbbbbb");
  mem.addUser("cccccccc");
  await mem.prune();
  const m = mem.messages();
  expect(m[0]!.role).toBe("system");
  expect(m.slice(-2).map((x) => x.content)).toEqual(["bbbbbbbb", "cccccccc"]);
});

test("prune() folds overflow into a single summary via an injected async summarizer", async () => {
  const seen: Message[][] = [];
  const summarize = async (dropped: Message[]) => {
    seen.push(dropped);
    return "SUMMARY: " + dropped.map((m) => m.content).join(",");
  };
  const mem = createMemory({ maxTokens: 18, keepLast: 2, summarize });
  mem.addUser("aaaaaaaaaaaa");
  mem.addAssistant("bbbbbbbbbbbb");
  mem.addUser("cccccccccccc");
  mem.addAssistant("dddddddddddd");
  await mem.prune();
  const m = mem.messages();
  // a summary note replaces the oldest overflow
  expect(m[0]!.role).toBe("system");
  expect(m[0]!.content).toContain("SUMMARY:");
  expect(m[0]!.name).toBe("memory_summary");
  // newest keepLast preserved verbatim
  expect(m.slice(-2).map((x) => x.content)).toEqual([
    "cccccccccccc",
    "dddddddddddd",
  ]);
  // the summarizer was handed the dropped turns, oldest first
  expect(seen[0]!.map((x) => x.content)).toEqual([
    "aaaaaaaaaaaa",
    "bbbbbbbbbbbb",
  ]);
});

test("prune() supports a synchronous summarizer too", async () => {
  const mem = createMemory({
    maxTokens: 14,
    keepLast: 1,
    summarize: (d) => `S(${d.length})`,
  });
  mem.addUser("aaaaaaaaaaaa");
  mem.addUser("bbbbbbbbbbbb");
  mem.addUser("cccccccccccc");
  await mem.prune();
  const m = mem.messages();
  expect(m[0]!.content).toMatch(/^S\(/);
  expect(m[m.length - 1]!.content).toBe("cccccccccccc");
});

test("prune() is a no-op when already within budget", async () => {
  const mem = createMemory({ maxMessages: 10 });
  mem.addUser("a");
  mem.addAssistant("b");
  await mem.prune();
  expect(mem.messages().map((x) => x.content)).toEqual(["a", "b"]);
});

test("prune() uses an injected exact token counter", async () => {
  const wordCount = (t: string) => t.trim().split(/\s+/).length;
  const mem = createMemory({
    maxTokens: 12,
    keepLast: 1,
    countTokens: wordCount,
  });
  mem.addUser("alpha beta gamma");
  mem.addAssistant("delta epsilon");
  mem.addUser("zeta");
  await mem.prune();
  const m = mem.messages();
  expect(m[m.length - 1]!.content).toBe("zeta");
  expect(m.length).toBeLessThan(3);
});

test("toJSON()/fromJSON() round-trips history, window and system", () => {
  const mem = createMemory({ system: "sys" });
  mem.addUser("hi");
  mem.addAssistant("hello");
  const snap = mem.toJSON();
  const json = JSON.parse(JSON.stringify(snap)); // must be plain JSON

  const restored = createMemory();
  restored.fromJSON(json);
  expect(restored.messages()).toEqual(mem.messages());
  expect(restored.history()).toEqual(mem.history());
});

test("load() is an alias of fromJSON()", () => {
  const mem = createMemory({ system: "s" });
  mem.addUser("q");
  const snap = mem.toJSON();
  const restored = createMemory();
  restored.load(snap);
  expect(restored.messages()).toEqual(mem.messages());
});

test("toWindow() honours an explicit maxMessages override", () => {
  const mem = createMemory({ keepLast: 0 });
  mem.addUser("1");
  mem.addAssistant("2");
  mem.addUser("3");
  const w = mem.toWindow({ maxMessages: 1 });
  expect(w.map((m) => m.content)).toEqual(["3"]);
  expect(mem.messages().length).toBe(3); // unchanged
});
