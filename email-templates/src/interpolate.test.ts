import { test, expect } from "vitest";
import { interpolate, localize } from "./index";

test("interpolate fills {{var}} from an object", () => {
  expect(interpolate("Hi {{name}}, you have {{n}} messages", { name: "Ada", n: 3 })).toBe(
    "Hi Ada, you have 3 messages",
  );
});

test("interpolate tolerates surrounding whitespace in braces", () => {
  expect(interpolate("{{  name  }}", { name: "Ada" })).toBe("Ada");
});

test("interpolate leaves unknown keys untouched by default, or uses fallback", () => {
  expect(interpolate("Hi {{missing}}", {})).toBe("Hi {{missing}}");
  expect(interpolate("Hi {{missing}}", {}, { fallback: "there" })).toBe("Hi there");
});

test("interpolate accepts a function source (i18n backend)", () => {
  const dict: Record<string, string> = { name: "Bob" };
  expect(interpolate("Hi {{name}}", (k) => dict[k])).toBe("Hi Bob");
});

test("interpolate can HTML-escape resolved values", () => {
  expect(interpolate("{{x}}", { x: "<b>" }, { escape: true })).toBe("&lt;b&gt;");
  expect(interpolate("{{x}}", { x: "<b>" })).toBe("<b>");
});

test("localize resolves catalog keys and interpolates shared vars", () => {
  const t = localize({ greeting: "Hola {{name}}" }, { name: "Ada" });
  expect(t("greeting")).toBe("Hola Ada");
  expect(t("missing")).toBe("missing");
});

test("localize merges per-call vars over shared vars", () => {
  const t = localize({ line: "{{a}}-{{b}}" }, { a: "1", b: "2" });
  expect(t("line", { b: "9" })).toBe("1-9");
});
