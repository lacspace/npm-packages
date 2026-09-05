import { test, expect } from "vitest";
import { slugify, uniqueSlug, slugifyPath, slugifyFilename } from "./index";

test("existing behavior is unchanged", () => {
  expect(slugify("Hello, World!")).toBe("hello-world");
  expect(slugify("Zürich")).toBe("zurich"); // default ASCII fold
  expect(slugify("Straße")).toBe("strasse");
  expect(slugify("C++ & C#", { replace: { "++": "pp", "#": "sharp" } })).toBe("cpp-csharp");
  // & is still stripped by default (no symbols option).
  expect(slugify("Rock & Roll")).toBe("rock-roll");
  expect(uniqueSlug("Hello", new Set(["hello", "hello-2"]))).toBe("hello-3");
});

test("Cyrillic transliteration", () => {
  expect(slugify("Привет мир")).toBe("privet-mir");
  expect(slugify("Москва")).toBe("moskva");
});

test("Greek transliteration", () => {
  expect(slugify("Καλημέρα")).toBe("kalimera");
  expect(slugify("Αθήνα")).toBe("athina");
});

test("Turkish characters fold to ASCII", () => {
  expect(slugify("İstanbul Şehri")).toBe("istanbul-sehri");
  expect(slugify("Çağ")).toBe("cag");
});

test("german option expands umlauts", () => {
  expect(slugify("Zürich", { german: true })).toBe("zuerich");
  expect(slugify("Müller Öl Ärger", { german: true })).toBe("mueller-oel-aerger");
  expect(slugify("Straße", { german: true })).toBe("strasse");
});

test("symbols option expands symbols to words", () => {
  expect(slugify("Rock & Roll", { symbols: true })).toBe("rock-and-roll");
  expect(slugify("50% off", { symbols: true })).toBe("50-percent-off");
  expect(slugify("€100 deal", { symbols: true })).toBe("euro-100-deal");
});

test("fallback option for empty results", () => {
  expect(slugify("!!!")).toBe("");
  expect(slugify("!!!", { fallback: "n-a" })).toBe("n-a");
  expect(slugify("", { fallback: "untitled" })).toBe("untitled");
});

test("maxLength truncates on a word boundary", () => {
  expect(slugify("a very long article title here", { maxLength: 15 })).toBe("a-very-long");
});

test("slugifyPath preserves slashes", () => {
  expect(slugifyPath("/Blog/My First Post/")).toBe("/blog/my-first-post/");
  expect(slugifyPath("Docs/Café Guide")).toBe("docs/cafe-guide");
  expect(slugifyPath("a/b", { german: true })).toBe("a/b");
});

test("slugifyFilename preserves the extension", () => {
  expect(slugifyFilename("My File.PDF")).toBe("my-file.pdf");
  expect(slugifyFilename("Résumé (final).docx")).toBe("resume-final.docx");
  expect(slugifyFilename("archive.tar.gz")).toBe("archive-tar.gz");
  expect(slugifyFilename("no-extension")).toBe("no-extension");
  expect(slugifyFilename(".env")).toBe("env");
});
