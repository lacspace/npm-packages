import { test, expect } from "vitest";
import {
  words,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  titleCase,
} from "./index";

test("camelCase", () => {
  expect(camelCase("foo_bar")).toBe("fooBar");
  expect(camelCase("Hello World")).toBe("helloWorld");
  expect(camelCase("XMLHttpRequest")).toBe("xmlHttpRequest");
});

test("pascalCase", () => {
  expect(pascalCase("foo_bar")).toBe("FooBar");
  expect(pascalCase("hello world")).toBe("HelloWorld");
});

test("snakeCase", () => {
  expect(snakeCase("fooBar")).toBe("foo_bar");
  expect(snakeCase("XMLHttpRequest")).toBe("xml_http_request");
});

test("kebabCase", () => {
  expect(kebabCase("fooBar")).toBe("foo-bar");
  expect(kebabCase("XMLHttpRequest")).toBe("xml-http-request");
});

test("titleCase", () => {
  expect(titleCase("foo bar")).toBe("Foo Bar");
  expect(titleCase("hello_world")).toBe("Hello World");
});

test("empty string", () => {
  expect(camelCase("")).toBe("");
  expect(pascalCase("")).toBe("");
  expect(words("")).toEqual([]);
});

test("words() splits acronym boundaries in XMLHttpRequest", () => {
  expect(words("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
});
