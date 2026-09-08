import { describe, it, expect } from "vitest";
import {
  serializeCookie,
  parseCookieHeader,
  getCookieValue,
  cacheControl,
  matchPath,
  matchesAny,
  createPathMatcher,
  pathPatternToRegExp,
  isSafeRedirectPath,
  sanitizeRedirect,
  extractBearerToken,
  generateCsrfToken,
  timingSafeStringEqual,
  statusFromError,
  errorPayload,
  parseSearchParams,
} from "./core";

describe("serializeCookie", () => {
  it("encodes the value and appends only provided attributes", () => {
    expect(serializeCookie("t", "a b")).toBe("t=a%20b");
  });
  it("serializes full attribute set in order", () => {
    const out = serializeCookie("sid", "x", {
      maxAge: 60,
      path: "/",
      domain: "example.com",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(out).toBe("sid=x; Max-Age=60; Domain=example.com; Path=/; HttpOnly; Secure; SameSite=Lax");
  });
  it("treats sameSite:true as Strict and floors maxAge", () => {
    expect(serializeCookie("a", "b", { sameSite: true, maxAge: 9.9 })).toBe("a=b; Max-Age=9; SameSite=Strict");
  });
  it("supports Expires, Priority and Partitioned", () => {
    const out = serializeCookie("a", "b", {
      expires: new Date("2030-01-01T00:00:00Z"),
      priority: "high",
      partitioned: true,
    });
    expect(out).toContain("; Expires=Tue, 01 Jan 2030 00:00:00 GMT");
    expect(out).toContain("; Partitioned");
    expect(out).toContain("; Priority=High");
  });
});

describe("parseCookieHeader / getCookieValue", () => {
  it("parses multiple pairs and decodes values", () => {
    expect(parseCookieHeader("a=1; b=hello%20world")).toEqual({ a: "1", b: "hello world" });
  });
  it("returns empty object for null/empty", () => {
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader("")).toEqual({});
  });
  it("first occurrence wins and unquotes", () => {
    expect(parseCookieHeader('x="quoted"; x=second')).toEqual({ x: "quoted" });
  });
  it("getCookieValue reads a single name", () => {
    expect(getCookieValue("a=1; token=abc", "token")).toBe("abc");
    expect(getCookieValue("a=1", "missing")).toBeUndefined();
  });
});

describe("cacheControl", () => {
  it("noStore short-circuits", () => {
    expect(cacheControl({ noStore: true, maxAge: 60 })).toBe("no-store");
  });
  it("builds a public SWR directive", () => {
    expect(cacheControl({ public: true, maxAge: 60, staleWhileRevalidate: 30 })).toBe(
      "public, max-age=60, stale-while-revalidate=30",
    );
  });
  it("private wins over public and clamps negatives", () => {
    expect(cacheControl({ private: true, public: true, maxAge: -5 })).toBe("private, max-age=0");
  });
  it("emits immutable + must-revalidate", () => {
    expect(cacheControl({ maxAge: 31536000, immutable: true })).toBe("max-age=31536000, immutable");
    expect(cacheControl({ noCache: true, mustRevalidate: true })).toBe("no-cache, must-revalidate");
  });
  it("empty options -> empty string", () => {
    expect(cacheControl()).toBe("");
  });
});

describe("matchPath / matchers", () => {
  it("matches literal paths exactly", () => {
    expect(matchPath("/login", "/login")).toBe(true);
    expect(matchPath("/login/x", "/login")).toBe(false);
  });
  it("single star matches within a segment only", () => {
    expect(matchPath("/api/users", "/api/*")).toBe(true);
    expect(matchPath("/api/users/1", "/api/*")).toBe(false);
  });
  it("double star matches across segments", () => {
    expect(matchPath("/api/users/1", "/api/**")).toBe(true);
  });
  it(":param matches one segment", () => {
    expect(matchPath("/users/42", "/users/:id")).toBe(true);
    expect(matchPath("/users/42/edit", "/users/:id")).toBe(false);
  });
  it("supports RegExp patterns", () => {
    expect(matchPath("/x", /^\/x$/)).toBe(true);
  });
  it("matchesAny and createPathMatcher", () => {
    expect(matchesAny("/api/x", ["/login", "/api/**"])).toBe(true);
    const m = createPathMatcher(["/public/**", /^\/health$/]);
    expect(m("/public/css/a.css")).toBe(true);
    expect(m("/health")).toBe(true);
    expect(m("/private")).toBe(false);
  });
  it("pathPatternToRegExp escapes regex metachars", () => {
    expect(pathPatternToRegExp("/a.b").test("/aXb")).toBe(false);
    expect(pathPatternToRegExp("/a.b").test("/a.b")).toBe(true);
  });
});

describe("isSafeRedirectPath / sanitizeRedirect", () => {
  it("accepts same-origin relative paths", () => {
    expect(isSafeRedirectPath("/dashboard")).toBe(true);
    expect(isSafeRedirectPath("/a/b?x=1#y")).toBe(true);
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
  });
  it("rejects non-strings, empties and control chars", () => {
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
    expect(isSafeRedirectPath("")).toBe(false);
    expect(isSafeRedirectPath("/a\nb")).toBe(false);
    expect(isSafeRedirectPath("relative")).toBe(false);
  });
  it("sanitizeRedirect falls back when unsafe", () => {
    expect(sanitizeRedirect("/ok")).toBe("/ok");
    expect(sanitizeRedirect("//evil.com")).toBe("/");
    expect(sanitizeRedirect("javascript:alert(1)", "/home")).toBe("/home");
  });
});

describe("extractBearerToken", () => {
  it("extracts a bearer token case-insensitively", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer   xyz  ")).toBe("xyz");
  });
  it("returns undefined for non-bearer or missing headers", () => {
    expect(extractBearerToken("Basic abc")).toBeUndefined();
    expect(extractBearerToken(null)).toBeUndefined();
    expect(extractBearerToken(undefined)).toBeUndefined();
  });
});

describe("generateCsrfToken / timingSafeStringEqual", () => {
  it("generates url-safe unpadded tokens of expected length", () => {
    const t = generateCsrfToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(42);
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
  it("compares in constant time by value", () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "ab")).toBe(false);
  });
});

describe("statusFromError / errorPayload", () => {
  it("reads status/statusCode, else 500", () => {
    expect(statusFromError({ status: 404 })).toBe(404);
    expect(statusFromError({ statusCode: 403 })).toBe(403);
    expect(statusFromError(new Error("x"))).toBe(500);
    expect(statusFromError({ status: 9999 })).toBe(500);
  });
  it("builds a JSON error payload with message", () => {
    expect(errorPayload({ status: 400, message: "Bad" })).toEqual({
      status: 400,
      body: { error: "Bad" },
    });
    expect(errorPayload(new Error("boom"))).toEqual({
      status: 500,
      body: { error: "boom" },
    });
    expect(errorPayload({}, 502)).toEqual({ status: 502, body: { error: "Internal Server Error" } });
  });
});

describe("parseSearchParams", () => {
  it("parses a query string, tolerating a leading ?", () => {
    expect(parseSearchParams("?a=1&b=2")).toEqual({ a: "1", b: "2" });
  });
  it("collapses repeated keys to arrays", () => {
    expect(parseSearchParams("tag=a&tag=b&x=1")).toEqual({ tag: ["a", "b"], x: "1" });
  });
  it("accepts a URLSearchParams instance", () => {
    expect(parseSearchParams(new URLSearchParams("q=hi"))).toEqual({ q: "hi" });
  });
});
