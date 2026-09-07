import { test, expect } from "vitest";
import {
  splitText,
  chunks,
  splitMarkdown,
  splitCode,
  splitBySentences,
  splitByParagraphs,
} from "./index";

const para = (word: string, n: number) => Array.from({ length: n }, () => word).join(" ");

test("empty input returns no chunks; tiny input returns exactly one", () => {
  expect(splitText("")).toEqual([]);
  expect(chunks("")).toEqual([]);
  const one = splitText("hello world", { chunkSize: 100, chunkOverlap: 0 });
  expect(one).toHaveLength(1);
  expect(one[0]!.text).toBe("hello world");
  expect(one[0]!.start).toBe(0);
  expect(one[0]!.end).toBe(11);
});

test("chunk sizes respect the budget", () => {
  const text = para("lorem", 400); // ~2400 chars, space separated
  const cs = splitText(text, { chunkSize: 200, chunkOverlap: 20 });
  expect(cs.length).toBeGreaterThan(1);
  for (const c of cs) expect(c.text.length).toBeLessThanOrEqual(200);
});

test("overlap is applied between adjacent chunks", () => {
  const text = para("token", 300);
  const cs = splitText(text, { chunkSize: 120, chunkOverlap: 40 });
  expect(cs.length).toBeGreaterThan(2);
  // Consecutive chunks should overlap in source offsets.
  let overlaps = 0;
  for (let i = 1; i < cs.length; i++) {
    if (cs[i]!.start < cs[i - 1]!.end) overlaps++;
  }
  expect(overlaps).toBeGreaterThan(0);
});

test("zero overlap produces non-overlapping, contiguous coverage", () => {
  const text = para("word", 200);
  const cs = splitText(text, { chunkSize: 100, chunkOverlap: 0 });
  for (let i = 1; i < cs.length; i++) {
    expect(cs[i]!.start).toBeGreaterThanOrEqual(cs[i - 1]!.end);
  }
});

test("offsets are correct: text equals the source slice", () => {
  const text = "First paragraph here.\n\nSecond paragraph is a bit longer than the first one.\n\nThird.";
  const cs = splitText(text, { chunkSize: 40, chunkOverlap: 5 });
  for (const c of cs) {
    expect(text.slice(c.start, c.end)).toBe(c.text);
    expect(c.end).toBeGreaterThan(c.start);
  }
});

test("prefers higher-level separators (paragraph boundaries)", () => {
  const text = "AAAA\n\nBBBB\n\nCCCC\n\nDDDD";
  const cs = splitText(text, { chunkSize: 10, chunkOverlap: 0 });
  // Each ~4-char block should land on paragraph boundaries, not mid-word.
  for (const c of cs) expect(c.text).not.toMatch(/^[A-D]\n/);
  expect(cs.map((c) => c.text)).toContain("AAAA");
});

test("custom separators change the boundaries", () => {
  const text = "a|b|c|d|e|f|g|h";
  const cs = chunks(text, { chunkSize: 3, chunkOverlap: 0, separators: ["|", ""] });
  expect(cs.length).toBeGreaterThan(1);
  // No chunk should exceed 3 chars using the custom pipe separator.
  for (const c of cs) expect(c.length).toBeLessThanOrEqual(3);
});

test("a custom lengthFn (token counting) changes the boundaries", () => {
  const text = para("alpha", 30); // 30 words
  const tokenLen = (s: string) => (s.trim() === "" ? 0 : s.trim().split(/\s+/).length);
  const byToken = splitText(text, { chunkSize: 5, chunkOverlap: 0, lengthFn: tokenLen });
  // Each chunk must be <= 5 "tokens" (words).
  for (const c of byToken) expect(tokenLen(c.text)).toBeLessThanOrEqual(5);
  // Char-based splitting on the same budget would produce very different output.
  const byChar = splitText(text, { chunkSize: 5, chunkOverlap: 0 });
  expect(byToken.length).not.toBe(byChar.length);
});

test("invalid options throw", () => {
  expect(() => splitText("hi", { chunkSize: 10, chunkOverlap: 10 })).toThrow(RangeError);
  expect(() => splitText("hi", { chunkSize: 0 })).toThrow(RangeError);
});

test("markdown keeps heading breadcrumbs on nested sections", () => {
  const md = [
    "# Guide",
    "",
    "Intro text.",
    "",
    "## Setup",
    "",
    "Install the thing and configure it.",
    "",
    "### Details",
    "",
    "Some deeper details go here.",
  ].join("\n");
  const cs = splitMarkdown(md, { chunkSize: 200 });
  const details = cs.find((c) => c.text.includes("deeper details"));
  expect(details).toBeDefined();
  // Breadcrumb should carry the full heading trail.
  expect(details!.text).toContain("# Guide > ## Setup > ### Details");
  // Offsets still map into the source body.
  expect(md.slice(details!.start, details!.end)).toContain("deeper details");
});

test("markdown does not split fenced code blocks", () => {
  const code = "```js\n" + para("const", 60) + "\nfunction big(){ return 1 }\n```";
  const md = "# Title\n\nSome prose before the code.\n\n" + code + "\n\nAfter.";
  const cs = splitMarkdown(md, { chunkSize: 80, chunkOverlap: 0 });
  // The whole fence must live inside a single chunk despite the small budget.
  const withFence = cs.filter((c) => c.text.includes("```js"));
  expect(withFence).toHaveLength(1);
  expect(withFence[0]!.text).toContain("function big(){ return 1 }");
  expect(withFence[0]!.text.split("```").length).toBe(3); // opening + closing fence
});

test("markdown breadcrumbs can be disabled", () => {
  const md = "# H\n\nbody text here";
  const cs = splitMarkdown(md, { includeBreadcrumb: false });
  expect(cs[0]!.text).not.toContain(">");
});

test("splitBySentences: one chunk per sentence by default", () => {
  const text = "The cat sat. The dog ran! Did the bird fly? Yes.";
  const cs = splitBySentences(text);
  expect(cs).toHaveLength(4);
  expect(cs[0]!.text).toBe("The cat sat.");
  expect(cs[2]!.text).toBe("Did the bird fly?");
  // Offsets check out.
  for (const c of cs) expect(text.slice(c.start, c.end)).toBe(c.text);
});

test("splitBySentences: packs sentences when chunkSize is given", () => {
  const text = "One. Two. Three. Four. Five. Six.";
  const cs = splitBySentences(text, { chunkSize: 12, chunkOverlap: 0 });
  expect(cs.length).toBeLessThan(6);
  for (const c of cs) expect(c.text.length).toBeLessThanOrEqual(12);
});

test("splitByParagraphs splits on blank lines", () => {
  const text = "Para one line.\n\nPara two\nwith two lines.\n\nPara three.";
  const cs = splitByParagraphs(text);
  expect(cs).toHaveLength(3);
  expect(cs[1]!.text).toBe("Para two\nwith two lines.");
});

test("splitCode keeps top-level functions whole (brace language)", () => {
  const code = [
    "function alpha() {",
    "  return 1;",
    "}",
    "",
    "function beta() {",
    "  return 2;",
    "}",
    "",
    "function gamma() {",
    "  return 3;",
    "}",
  ].join("\n");
  const cs = splitCode(code, { language: "ts", chunkSize: 40, chunkOverlap: 0 });
  expect(cs.length).toBeGreaterThan(1);
  // No chunk should start or end in the middle of a brace block.
  for (const c of cs) {
    const opens = (c.text.match(/{/g) ?? []).length;
    const closes = (c.text.match(/}/g) ?? []).length;
    expect(opens).toBe(closes);
  }
});

test("splitCode handles python top-level defs (indentation)", () => {
  const code = [
    "def a():",
    "    return 1",
    "",
    "def b():",
    "    x = 1",
    "    return x",
    "",
    "def c():",
    "    return 3",
  ].join("\n");
  const cs = splitCode(code, { language: "python", chunkSize: 30, chunkOverlap: 0 });
  expect(cs.length).toBeGreaterThan(1);
  // Each def body should stay attached to its def line.
  const first = cs.find((c) => c.text.includes("def a"));
  expect(first!.text).toContain("return 1");
});
