import { describe, it, expect } from "vitest";
import { matchPath, methodMatches } from "./router.js";

describe("router", () => {
  it("matches a static path", () => {
    expect(matchPath("/health", "/health")).toEqual({ params: {} });
    expect(matchPath("/health", "/nope")).toBeNull();
  });

  it("captures a named param", () => {
    expect(matchPath("/users/:id", "/users/42")).toEqual({ params: { id: "42" } });
  });

  it("captures multiple params", () => {
    expect(matchPath("/a/:x/b/:y", "/a/1/b/2")).toEqual({ params: { x: "1", y: "2" } });
  });

  it("rejects on length mismatch when no wildcard", () => {
    expect(matchPath("/users/:id", "/users/1/extra")).toBeNull();
    expect(matchPath("/users/:id", "/users")).toBeNull();
  });

  it("wildcard swallows the tail", () => {
    expect(matchPath("/files/*", "/files/a/b/c")).toEqual({ params: { "*": "a/b/c" } });
    expect(matchPath("/files/*", "/files")).toEqual({ params: { "*": "" } });
  });

  it("decodes url-encoded segments", () => {
    expect(matchPath("/users/:id", "/users/a%20b")).toEqual({ params: { id: "a b" } });
  });

  it("methodMatches handles wildcard and case", () => {
    expect(methodMatches(undefined, "GET")).toBe(true);
    expect(methodMatches("*", "POST")).toBe(true);
    expect(methodMatches("get", "GET")).toBe(true);
    expect(methodMatches("POST", "GET")).toBe(false);
  });
});
