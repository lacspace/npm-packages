import { test, expect } from "vitest";
import { slugify, uniqueSlug, slugger, isSlug } from "./index";

// --- strict option ---------------------------------------------------------

test("strict drops non-alphanumerics within a word", () => {
  expect(slugify("a.b.c!", { strict: true })).toBe("abc");
  expect(slugify("C++ & C#", { strict: true })).toBe("c-c");
  expect(slugify("node_modules", { strict: true })).toBe("nodemodules");
});

test("strict still splits on whitespace", () => {
  expect(slugify("Hello, World!", { strict: true })).toBe("hello-world");
  expect(slugify("foo   bar", { strict: true })).toBe("foo-bar");
});

test("strict is off by default (unchanged output)", () => {
  expect(slugify("a.b.c!")).toBe("a-b-c");
  expect(slugify("node_modules")).toBe("node-modules");
});

test("strict respects a custom separator", () => {
  expect(slugify("Hello, World!", { strict: true, separator: "_" })).toBe("hello_world");
});

// --- locale option ---------------------------------------------------------

test("locale de expands umlauts like german:true", () => {
  expect(slugify("Zürich", { locale: "de" })).toBe("zuerich");
  expect(slugify("Straße", { locale: "de-DE" })).toBe("strasse");
});

test("locale tr folds dotted/dotless i", () => {
  expect(slugify("İstanbul", { locale: "tr" })).toBe("istanbul");
  expect(slugify("Işık", { locale: "tr" })).toBe("isik");
});

test("locale is off by default", () => {
  expect(slugify("Zürich")).toBe("zurich");
});

// --- configurable uniqueSlug suffix ---------------------------------------

test("uniqueSlug counterStart changes the first suffix", () => {
  expect(uniqueSlug("Hello", new Set(["hello"]), { counterStart: 1 })).toBe("hello-1");
});

test("uniqueSlug custom suffix builder", () => {
  const opts = { suffix: (b: string, n: number) => `${b}-copy${n}` };
  expect(uniqueSlug("Hello", new Set(["hello"]), opts)).toBe("hello-copy2");
  expect(uniqueSlug("Hello", new Set(["hello", "hello-copy2"]), opts)).toBe("hello-copy3");
});

test("uniqueSlug default suffix unchanged", () => {
  expect(uniqueSlug("Hello", new Set(["hello", "hello-2"]))).toBe("hello-3");
});

// --- slugger() factory -----------------------------------------------------

test("slugger remembers what it emitted", () => {
  const next = slugger();
  expect(next("Hello")).toBe("hello");
  expect(next("Hello")).toBe("hello-2");
  expect(next("Hello")).toBe("hello-3");
  expect(next("Fresh")).toBe("fresh");
});

test("slugger is callable and has .slug()", () => {
  const s = slugger();
  expect(s.slug("Post")).toBe("post");
  expect(s("Post")).toBe("post-2");
});

test("slugger .add() and .has() reserve slugs", () => {
  const s = slugger();
  s.add("hello", "hello-2");
  expect(s.has("hello")).toBe(true);
  expect(s("Hello")).toBe("hello-3");
});

test("slugger .reset() forgets history", () => {
  const s = slugger();
  s("Hello");
  s("Hello");
  s.reset();
  expect(s.seen.size).toBe(0);
  expect(s("Hello")).toBe("hello");
});

test("slugger .seen exposes emitted slugs", () => {
  const s = slugger();
  s("A");
  s("B");
  expect(new Set(s.seen)).toEqual(new Set(["a", "b"]));
});

test("slugger honors base options and per-call overrides", () => {
  const s = slugger({ separator: "_" });
  expect(s("Hello World")).toBe("hello_world");
  expect(s("Hello World")).toBe("hello_world_2");
  expect(s("Rock & Roll", { symbols: true })).toBe("rock_and_roll");
});

// --- isSlug validator ------------------------------------------------------

test("isSlug accepts canonical slugs", () => {
  expect(isSlug("hello-world")).toBe(true);
  expect(isSlug("stockyatra-paper-trading")).toBe(true);
  expect(isSlug("2026-launch")).toBe(true);
});

test("isSlug rejects non-canonical strings", () => {
  expect(isSlug("Hello World")).toBe(false);
  expect(isSlug("hello--world")).toBe(false);
  expect(isSlug("-hello")).toBe(false);
  expect(isSlug("hello-")).toBe(false);
  expect(isSlug("héllo")).toBe(false);
  expect(isSlug("")).toBe(false);
});

test("isSlug respects separator option", () => {
  expect(isSlug("hello_world", { separator: "_" })).toBe(true);
  expect(isSlug("hello-world", { separator: "_" })).toBe(false);
});

test("isSlug validates its own slugify output", () => {
  const out = slugify("Héllo, World! — 2026");
  expect(isSlug(out)).toBe(true);
});
