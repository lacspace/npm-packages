import { describe, it, expect } from "vitest";
import { toCurl, fromCurl, tokenizeCurl } from "./curl.js";
import type { CapturedRequest } from "./capture.js";

function rec(over: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "1", at: "2026-09-06T00:00:00.000Z", method: "POST",
    path: "/hooks/x", url: "/hooks/x?a=1", query: { a: "1" },
    headers: { "content-type": "application/json", "x-token": "abc", host: "example.com", "content-length": "7" },
    body: '{"a":1}', contentType: "application/json", bytes: 7,
    ...over,
  };
}

describe("tokenizeCurl", () => {
  it("splits on whitespace and honors quotes + line continuations", () => {
    const t = tokenizeCurl("curl -X POST 'http://x/y' \\\n  -H 'A: b c' --data-raw \"{\\\"k\\\":1}\"");
    expect(t).toEqual(["curl", "-X", "POST", "http://x/y", "-H", "A: b c", "--data-raw", '{"k":1}']);
  });
});

describe("toCurl", () => {
  it("builds a runnable curl, dropping transport headers", () => {
    const s = toCurl(rec(), { multiline: false, base: "http://localhost:4000" });
    expect(s).toContain("curl -X POST");
    expect(s).toContain("http://localhost:4000/hooks/x?a=1");
    expect(s).toContain("-H 'content-type: application/json'");
    expect(s).toContain("-H 'x-token: abc'");
    expect(s).not.toContain("-H 'host:");
    expect(s).not.toContain("content-length");
    expect(s).toContain(`--data-raw '{"a":1}'`);
  });
  it("omits -X and body for GET", () => {
    const s = toCurl(rec({ method: "GET", body: "", url: "/ping" }), { multiline: false });
    expect(s).not.toContain("-X");
    expect(s).not.toContain("--data-raw");
    expect(s).toContain("/ping");
  });
  it("escapes single quotes in the body", () => {
    const s = toCurl(rec({ body: "it's" }), { multiline: false });
    expect(s).toContain(`--data-raw 'it'\\''s'`);
  });
});

describe("fromCurl", () => {
  it("parses method, url, headers and data", () => {
    const r = fromCurl(`curl -X POST 'http://localhost:3000/webhook?x=1' -H 'Content-Type: application/json' -H 'X-Token: t' --data-raw '{"hi":true}'`);
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/webhook");
    expect(r.url).toBe("/webhook?x=1");
    expect(r.query).toEqual({ x: "1" });
    expect(r.body).toBe('{"hi":true}');
    expect(r.contentType).toBe("application/json");
    expect(r.bytes).toBe(11);
  });
  it("defaults to POST when data is present, GET otherwise", () => {
    expect(fromCurl("curl http://x/ -d 'a=1'").method).toBe("POST");
    expect(fromCurl("curl http://x/ping").method).toBe("GET");
  });
  it("supports --json shorthand", () => {
    const r = fromCurl(`curl http://x/y --json '{"a":1}'`);
    expect(r.method).toBe("POST");
    expect(r.body).toBe('{"a":1}');
    expect(r.contentType).toBe("application/json");
  });
  it("throws when there is no URL", () => {
    expect(() => fromCurl("curl -X POST -H 'A: b'")).toThrow(/url/i);
  });
});

describe("toCurl → fromCurl round-trip", () => {
  it("preserves method, path, body and app headers", () => {
    const original = rec({ headers: { "content-type": "application/json", "x-token": "abc" } });
    const back = fromCurl(toCurl(original, { base: "http://localhost:4000" }));
    expect(back.method).toBe(original.method);
    expect(back.path).toBe(original.path);
    expect(back.body).toBe(original.body);
    expect(back.query).toEqual(original.query);
    const h = Object.fromEntries(Object.entries(back.headers).map(([k, v]) => [k.toLowerCase(), v]));
    expect(h["content-type"]).toBe("application/json");
    expect(h["x-token"]).toBe("abc");
  });
});
