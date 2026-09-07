import { test, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

test("splits frontmatter data from the remaining content", () => {
  const { data, content } = parseFrontmatter(
    ["---", "title: Hello World", "draft: false", "views: 42", "---", "", "# Body", "", "Text here."].join("\n"),
  );
  expect(data.title).toBe("Hello World");
  expect(data.draft).toBe(false);
  expect(data.views).toBe(42);
  expect(content.trimStart().startsWith("# Body")).toBe(true);
  expect(content).not.toContain("title:");
});

test("parses inline and block lists, quotes, null", () => {
  const { data } = parseFrontmatter(
    ["---", "tags: [a, b, c]", "authors:", "  - Ada", "  - Grace", 'note: "quoted: value"', "empty:", "---", "body"].join("\n"),
  );
  expect(data.tags).toEqual(["a", "b", "c"]);
  expect(data.authors).toEqual(["Ada", "Grace"]);
  expect(data.note).toBe("quoted: value");
  expect(data.empty).toEqual([]);
});

test("no frontmatter → empty data, content unchanged", () => {
  const src = "# Just a doc\n\nno frontmatter";
  const { data, content } = parseFrontmatter(src);
  expect(data).toEqual({});
  expect(content).toBe(src);
});

test("ignores comments and strips inline comments on unquoted scalars", () => {
  const { data } = parseFrontmatter(["---", "# a comment", "slug: my-post # trailing", "---", "x"].join("\n"));
  expect(data.slug).toBe("my-post");
});
