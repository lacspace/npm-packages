import { test, expect } from "vitest";
import { slugify, uniqueSlug } from "./index";

test("basic slug", () => {
  expect(slugify("Hello, World!")).toBe("hello-world");
  expect(slugify("Héllo, World! — 2026")).toBe("hello-world-2026");
});

test("diacritic transliteration", () => {
  expect(slugify("Café")).toBe("cafe");
  expect(slugify("Zürich")).toBe("zurich");
  expect(slugify("Straße")).toBe("strasse");
});

test("uniqueSlug appends a suffix against existing set", () => {
  expect(uniqueSlug("Hello", new Set(["hello", "hello-2"]))).toBe("hello-3");
  expect(uniqueSlug("Fresh", new Set(["hello"]))).toBe("fresh");
});

test("separator:'' does not throw", () => {
  expect(() => slugify("Hello World", { separator: "" })).not.toThrow();
  expect(slugify("Hello World", { separator: "" })).toBe("helloworld");
});
