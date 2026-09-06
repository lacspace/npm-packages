import { describe, it, expect } from "vitest";
import { matchRule, findRule, resolveResponse, normalizeRules } from "./rules.js";
import type { Rule } from "./rules.js";
import type { CapturedRequest } from "./capture.js";

function rec(over: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "1", at: "2026-09-06T00:00:00.000Z", method: "POST",
    path: "/pay", url: "/pay?mode=live", query: { mode: "live" },
    headers: { "content-type": "application/json", "x-env": "test" },
    body: '{"type":"charge","amount":500}', contentType: "application/json", bytes: 30,
    ...over,
  };
}

describe("matchRule", () => {
  it("matches an empty/absent match block (catch-all)", () => {
    expect(matchRule({}, rec())).toBe(true);
    expect(matchRule({ match: {} }, rec())).toBe(true);
  });
  it("matches on method + exact path", () => {
    expect(matchRule({ match: { method: "post", path: "/pay" } }, rec())).toBe(true);
    expect(matchRule({ match: { method: "GET", path: "/pay" } }, rec())).toBe(false);
    expect(matchRule({ match: { path: "/other" } }, rec())).toBe(false);
  });
  it("matches a path glob and a /regex/", () => {
    expect(matchRule({ match: { path: "/pa*" } }, rec())).toBe(true);
    expect(matchRule({ match: { path: "/p.y/" } }, rec())).toBe(true);
    expect(matchRule({ match: { path: "/x*" } }, rec())).toBe(false);
  });
  it("matches pathPrefix, bodyContains and bodyRegex", () => {
    expect(matchRule({ match: { pathPrefix: "/pa" } }, rec())).toBe(true);
    expect(matchRule({ match: { bodyContains: "charge" } }, rec())).toBe(true);
    expect(matchRule({ match: { bodyContains: "refund" } }, rec())).toBe(false);
    expect(matchRule({ match: { bodyRegex: '"amount":\\d+' } }, rec())).toBe(true);
  });
  it("matches headers (exact + wildcard) and query", () => {
    expect(matchRule({ match: { header: { "X-Env": "test" } } }, rec())).toBe(true);
    expect(matchRule({ match: { header: { "x-env": "*" } } }, rec())).toBe(true);
    expect(matchRule({ match: { header: { "x-missing": "*" } } }, rec())).toBe(false);
    expect(matchRule({ match: { query: { mode: "live" } } }, rec())).toBe(true);
    expect(matchRule({ match: { query: { mode: "test" } } }, rec())).toBe(false);
  });
});

describe("findRule", () => {
  it("returns the first matching rule", () => {
    const rules: Rule[] = [
      { name: "get", match: { method: "GET" } },
      { name: "charge", match: { bodyContains: "charge" } },
      { name: "all" },
    ];
    expect(findRule(rules, rec())?.name).toBe("charge");
    expect(findRule(rules, rec({ method: "GET", body: "" }))?.name).toBe("get");
  });
});

describe("resolveResponse", () => {
  it("defaults to 200 empty", () => {
    const r = resolveResponse({});
    expect(r.status).toBe(200);
    expect(r.body).toBe("");
    expect(r.delay).toBe(0);
  });
  it("serializes a json body with a json content-type", () => {
    const r = resolveResponse({ response: { status: 201, json: { ok: true }, delay: 50 } });
    expect(r.status).toBe(201);
    expect(r.body).toBe('{"ok":true}');
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.delay).toBe(50);
  });
  it("keeps a raw body and custom headers", () => {
    const r = resolveResponse({ response: { body: "pong", headers: { "x-mock": "1" }, contentType: "text/plain" } });
    expect(r.body).toBe("pong");
    expect(r.headers["x-mock"]).toBe("1");
    expect(r.headers["content-type"]).toBe("text/plain");
  });
});

describe("normalizeRules", () => {
  it("accepts a bare array and a { rules: [] } object", () => {
    expect(normalizeRules([{ name: "a" }])).toHaveLength(1);
    expect(normalizeRules({ rules: [{ name: "a" }, { name: "b" }] })).toHaveLength(2);
  });
  it("throws on a bad shape", () => {
    expect(() => normalizeRules(42)).toThrow();
    expect(() => normalizeRules({ nope: true })).toThrow();
    expect(() => normalizeRules([{ match: "x" }])).toThrow();
  });
});
