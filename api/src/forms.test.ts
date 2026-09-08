import { test, expect } from "vitest";
import { formBody } from "./forms";

test("formBody builds URLSearchParams from an object", () => {
  const b = formBody({ email: "a@b.com", n: 2, ok: true });
  expect(b).toBeInstanceOf(URLSearchParams);
  expect(b.toString()).toBe("email=a%40b.com&n=2&ok=true");
});

test("formBody drops null/undefined and repeats arrays", () => {
  const b = formBody({ a: 1, b: null, c: undefined, tags: ["x", "y"] });
  expect(b.toString()).toBe("a=1&tags=x&tags=y");
});

test("formBody accepts entry tuples", () => {
  const b = formBody([["a", 1], ["b", "two"]]);
  expect(b.toString()).toBe("a=1&b=two");
});
