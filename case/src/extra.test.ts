import { test, expect, afterEach } from "vitest";
import {
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  constantCase,
  titleCase,
  sentenceCase,
  headerCase,
  trainCase,
  capitalCase,
  noCase,
  changeCase,
  isCase,
  isCamelCase,
  isPascalCase,
  isSnakeCase,
  isKebabCase,
  isConstantCase,
  isTitleCase,
  isHeaderCase,
  isNoCase,
  splitWords,
  registerAcronyms,
  getAcronyms,
  clearAcronyms,
} from "./index";

afterEach(() => clearAcronyms());

test("headerCase / trainCase", () => {
  expect(headerCase("foo bar baz")).toBe("Foo-Bar-Baz");
  expect(headerCase("XMLHttpRequest")).toBe("Xml-Http-Request");
  expect(headerCase("XMLHttpRequest", { acronyms: ["XML"] })).toBe("XML-Http-Request");
  expect(trainCase("foo_bar")).toBe("Foo-Bar");
});

test("capitalCase", () => {
  expect(capitalCase("foo_bar")).toBe("Foo Bar");
  expect(capitalCase("hello-world")).toBe("Hello World");
});

test("noCase", () => {
  expect(noCase("fooBar")).toBe("foo bar");
  expect(noCase("XMLHttpRequest")).toBe("xml http request");
});

test("changeCase supports the new names", () => {
  expect(changeCase("fooBar", "header")).toBe("Foo-Bar");
  expect(changeCase("fooBar", "train")).toBe("Foo-Bar");
  expect(changeCase("fooBar", "capital")).toBe("Foo Bar");
  expect(changeCase("fooBar", "no")).toBe("foo bar");
});

test("splitWords splits acronym boundaries", () => {
  expect(splitWords("APIResponse")).toEqual(["API", "Response"]);
  expect(splitWords("HTTPServer")).toEqual(["HTTP", "Server"]);
  expect(splitWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
});

test("splitWords keeps digit groups by default, splits when asked", () => {
  expect(splitWords("v2Point")).toEqual(["v2", "Point"]);
  expect(splitWords("v2Point", { splitOnNumbers: true })).toEqual(["v", "2", "Point"]);
  expect(splitWords("getUTF8String")).toEqual(["get", "UTF8", "String"]);
});

test("splitWords is unicode-aware and never drops accented words", () => {
  expect(splitWords("caféConLeche")).toEqual(["café", "Con", "Leche"]);
  expect(splitWords("motörHead_test")).toEqual(["motör", "Head", "test"]);
});

test("acronym registry preserves known acronyms in Pascal/Title (opt-in)", () => {
  expect(pascalCase("apiResponse")).toBe("ApiResponse"); // default unchanged
  expect(pascalCase("apiResponse", { acronyms: ["API"] })).toBe("APIResponse");
  expect(titleCase("get user id", { acronyms: ["ID"] })).toBe("Get User ID");
});

test("global registerAcronyms affects acronym-aware converters, cleared after", () => {
  expect(getAcronyms()).toEqual([]);
  registerAcronyms("URL", "API");
  expect(pascalCase("apiUrl")).toBe("APIURL");
  expect(camelCase("apiUrl")).toBe("apiURL"); // first word stays lower in camel
  clearAcronyms();
  expect(pascalCase("apiUrl")).toBe("ApiUrl");
});

test("unicode words are preserved by conversions", () => {
  expect(snakeCase("café bar")).toBe("café_bar");
  expect(kebabCase("Ñoño Test")).toBe("ñoño-test");
});

test("is<Case> detectors: positive", () => {
  expect(isCamelCase("fooBar")).toBe(true);
  expect(isPascalCase("FooBar")).toBe(true);
  expect(isSnakeCase("foo_bar")).toBe(true);
  expect(isKebabCase("foo-bar")).toBe(true);
  expect(isConstantCase("FOO_BAR")).toBe(true);
  expect(isTitleCase("Foo Bar")).toBe(true);
  expect(isHeaderCase("Foo-Bar")).toBe(true);
  expect(isNoCase("foo bar")).toBe(true);
});

test("is<Case> detectors: negative", () => {
  expect(isCamelCase("foo_bar")).toBe(false);
  expect(isSnakeCase("fooBar")).toBe(false);
  expect(isKebabCase("FOO-BAR")).toBe(false);
  expect(isConstantCase("foo_bar")).toBe(false);
  expect(isCamelCase("")).toBe(false);
});

test("isCase generic mirrors changeCase", () => {
  expect(isCase("foo-bar", "kebab")).toBe(true);
  expect(isCase("Foo-Bar", "header")).toBe(true);
  expect(isCase("foo bar", "no")).toBe(true);
  expect(isCase("fooBar", "kebab")).toBe(false);
});

test("idempotency: case(case(x)) === case(x)", () => {
  const inputs = ["XMLHttpRequest", "foo_bar-baz", "v2Point", "Hello World", "get UTF8 string"];
  const names = ["camel", "pascal", "snake", "kebab", "constant", "dot", "path", "title", "sentence", "header", "capital", "no"] as const;
  for (const s of inputs) {
    for (const n of names) {
      const once = changeCase(s, n);
      expect(changeCase(once, n)).toBe(once);
    }
  }
});

test("converting an already-correct string is a no-op", () => {
  expect(camelCase("fooBar")).toBe("fooBar");
  expect(snakeCase("foo_bar")).toBe("foo_bar");
  expect(headerCase("Foo-Bar")).toBe("Foo-Bar");
  expect(constantCase("FOO_BAR")).toBe("FOO_BAR");
});

test("sentenceCase acronym-aware", () => {
  expect(sentenceCase("the apiKey value", { acronyms: ["API"] })).toBe("The API key value");
});
