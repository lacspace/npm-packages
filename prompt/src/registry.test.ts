import { test, expect } from "vitest";
import { createRegistry } from "./index";

test("register + get renders the stored template", () => {
  const reg = createRegistry();
  reg.register("greeting", "Hi {{name}}");
  expect(reg.get("greeting").render({ name: "Ada" })).toBe("Hi Ada");
});

test("versions coexist; latest resolves and can be pinned", () => {
  const reg = createRegistry();
  reg.register("greeting", "Hi {{name}}"); // v1, latest by default
  reg.register("greeting", "Hello, {{name}}!", { version: "2", latest: true });
  expect(reg.get("greeting").render({ name: "Ada" })).toBe("Hello, Ada!");
  expect(reg.get("greeting", "1").render({ name: "Ada" })).toBe("Hi Ada");
  expect(reg.versions("greeting")).toEqual(["1", "2"]);
});

test("registering a new version does not steal latest unless asked", () => {
  const reg = createRegistry();
  reg.register("p", "v1 {{x}}"); // latest = 1
  reg.register("p", "v2 {{x}}", { version: "2" }); // latest stays 1
  expect(reg.get("p").render({ x: "!" })).toBe("v1 !");
  expect(reg.latest("p").render({ x: "!" })).toBe("v1 !");
});

test("duplicate name+version throws", () => {
  const reg = createRegistry();
  reg.register("p", "a");
  expect(() => reg.register("p", "b")).toThrow(/already registered/);
});

test("get/latest on unknown name throws; tryGet returns undefined", () => {
  const reg = createRegistry();
  expect(() => reg.get("nope")).toThrow(/No prompt registered/);
  expect(() => reg.get("nope", "1")).toThrow(/No prompt registered/);
  expect(reg.tryGet("nope")).toBeUndefined();
  reg.register("p", "x");
  expect(() => reg.get("p", "9")).toThrow(/no version "9"/);
  expect(reg.tryGet("p", "9")).toBeUndefined();
});

test("has, list and size reflect the store", () => {
  const reg = createRegistry();
  expect(reg.size).toBe(0);
  reg.register("a", "1");
  reg.register("a", "2", { version: "2" });
  reg.register("b", "1");
  expect(reg.has("a")).toBe(true);
  expect(reg.has("a", "2")).toBe(true);
  expect(reg.has("a", "9")).toBe(false);
  expect(reg.list()).toEqual(["a", "b"]);
  expect(reg.size).toBe(3);
});

test("remove drops a version and reassigns latest, or removes the whole name", () => {
  const reg = createRegistry();
  reg.register("p", "v1", { version: "1", latest: true });
  reg.register("p", "v2", { version: "2" });
  expect(reg.remove("p", "1")).toBe(true); // removes latest → falls back to v2
  expect(reg.latest("p").render()).toBe("v2");
  expect(reg.remove("p")).toBe(true); // whole name
  expect(reg.has("p")).toBe(false);
  expect(reg.remove("p")).toBe(false); // already gone
});

test("registries are isolated from each other", () => {
  const a = createRegistry();
  const b = createRegistry();
  a.register("x", "in-a");
  expect(b.has("x")).toBe(false);
});
