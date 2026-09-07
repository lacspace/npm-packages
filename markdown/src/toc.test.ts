import { test, expect } from "vitest";
import { slugifyHeading, tableOfContents } from "./toc";

test("slugifyHeading is GitHub-style and deterministic", () => {
  expect(slugifyHeading("Hello, World!")).toBe("hello-world");
  expect(slugifyHeading("Hello, World!")).toBe("hello-world"); // stable
  expect(slugifyHeading("  Spaced  Out  ")).toBe("spaced-out");
  expect(slugifyHeading("Café déjà vu")).toBe("café-déjà-vu"); // keeps unicode letters
});

test("tableOfContents nests by heading level", () => {
  const toc = tableOfContents(["# A", "## A1", "## A2", "### A2a", "# B"].join("\n"));
  expect(toc).toHaveLength(2);
  expect(toc[0]!.text).toBe("A");
  expect(toc[0]!.children.map((c) => c.text)).toEqual(["A1", "A2"]);
  expect(toc[0]!.children[1]!.children[0]!.text).toBe("A2a");
  expect(toc[1]!.text).toBe("B");
});

test("duplicate headings get -1/-2 suffixed slugs", () => {
  const toc = tableOfContents(["# Setup", "# Setup", "# Setup"].join("\n"));
  expect(toc.map((n) => n.slug)).toEqual(["setup", "setup-1", "setup-2"]);
});

test("ignores headings inside code fences and frontmatter", () => {
  const src = ["---", "title: X", "---", "# Real", "```", "# not a heading", "```"].join("\n");
  const toc = tableOfContents(src);
  expect(toc).toHaveLength(1);
  expect(toc[0]!.text).toBe("Real");
});

test("min/max level filtering", () => {
  const toc = tableOfContents(["# H1", "## H2", "### H3"].join("\n"), { minLevel: 2, maxLevel: 3 });
  expect(toc.map((n) => n.text)).toEqual(["H2"]);
  expect(toc[0]!.children.map((c) => c.text)).toEqual(["H3"]);
});
