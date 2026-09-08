import { test, expect } from "vitest";
import { joinUrl, joinPath, withQuery } from "./url";

test("joinUrl collapses slashes without touching the protocol", () => {
  expect(joinUrl("https://api.x.com/", "/v2/", "users")).toBe("https://api.x.com/v2/users");
  expect(joinUrl("https://api.x.com", "v2", "users", 7)).toBe("https://api.x.com/v2/users/7");
  expect(joinUrl("https://api.x.com//", "//a//", "//b")).toBe("https://api.x.com/a/b");
});

test("joinUrl skips empty segments", () => {
  expect(joinUrl("https://api.x.com", "", "users")).toBe("https://api.x.com/users");
  expect(joinUrl("")).toBe("");
});

test("joinPath builds host-less paths", () => {
  expect(joinPath("/a/", "/b/", "c")).toBe("a/b/c");
  expect(joinPath("a", "", "b")).toBe("a/b");
});

test("withQuery merges with existing query and preserves the hash", () => {
  expect(withQuery("/users", { page: 2 })).toBe("/users?page=2");
  expect(withQuery("/users?active=1", { page: 2 })).toBe("/users?active=1&page=2");
  expect(withQuery("/users#top", { page: 2 })).toBe("/users?page=2#top");
  expect(withQuery("/users", {})).toBe("/users");
});
