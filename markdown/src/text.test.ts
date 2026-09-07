import { test, expect } from "vitest";
import { toPlainText, excerpt } from "./text";

const RICH = [
  "---",
  "title: Ignore me",
  "---",
  "# Getting Started",
  "",
  "Some **bold**, *italic* and ~~struck~~ text with `inline code` and a",
  "[link](https://lacspace.com) plus an ![image](/img.png).",
  "",
  "- first item",
  "- [x] done item",
  "",
  "> a quote",
  "",
  "```ts",
  "const secret = 1;",
  "```",
].join("\n");

test("toPlainText strips markdown, frontmatter and code", () => {
  const t = toPlainText(RICH);
  expect(t).toContain("Getting Started");
  expect(t).toContain("bold");
  expect(t).toContain("struck");
  expect(t).toContain("link");
  expect(t).toContain("image"); // alt text kept
  expect(t).toContain("first item");
  expect(t).toContain("done item");
  expect(t).not.toContain("**");
  expect(t).not.toContain("~~");
  expect(t).not.toContain("`");
  expect(t).not.toContain("const secret"); // fenced code removed
  expect(t).not.toContain("title:"); // frontmatter removed
  expect(t).not.toContain("https://lacspace.com"); // link url dropped, label kept
});

test("excerpt truncates at a word boundary with a suffix", () => {
  const src = "The quick brown fox jumps over the lazy dog and keeps on running down the road.";
  const ex = excerpt(src, { length: 20 });
  expect(ex.length).toBeLessThanOrEqual(21); // 20 + suffix minus trimmed word
  expect(ex.endsWith("…")).toBe(true);
  expect(ex).not.toContain("  ");
  expect(/\w…$/.test(ex) || ex.endsWith(" …") === false).toBe(true);
  // never cut mid-word:
  expect(ex.slice(0, -1).trim().split(" ").every((w) => src.includes(w))).toBe(true);
});

test("excerpt returns full text when it already fits", () => {
  expect(excerpt("Short one.", { length: 100 })).toBe("Short one.");
});

test("excerpt custom suffix", () => {
  const ex = excerpt("one two three four five six seven eight", { length: 12, suffix: " [more]" });
  expect(ex.endsWith(" [more]")).toBe(true);
});
