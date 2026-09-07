import { describe, it, expect } from "vitest";
import { parseAssertion, evalAssertion, runAssertion, captureValue } from "./assert.js";
import type { ResponseRecord } from "./request.js";

function rec(over: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json; charset=utf-8" },
    timeMs: 42,
    size: 100,
    body: '{"ok":true,"user":"ada","data":{"items":[{"id":1}]}}',
    json: { ok: true, user: "ada", data: { items: [{ id: 1 }] } },
    url: "https://api.test/me",
    redirected: false,
    redirectChain: [],
    ok: true,
    truncated: false,
    crossHostRedirect: false,
    ...over,
  };
}

describe("parseAssertion", () => {
  it("parses binary and unary forms", () => {
    expect(parseAssertion("status == 200")).toMatchObject({ lhs: "status", op: "==", rhs: "200" });
    expect(parseAssertion("time < 1000")).toMatchObject({ lhs: "time", op: "<", rhs: "1000" });
    expect(parseAssertion("body.$.error exists")).toMatchObject({ lhs: "body.$.error", op: "exists" });
    expect(parseAssertion('header.content-type contains json')).toMatchObject({
      lhs: "header.content-type", op: "contains", rhs: "json",
    });
  });

  it("throws on unparseable input", () => {
    expect(() => parseAssertion("garbage")).toThrow(/Cannot parse/);
  });
});

describe("evalAssertion — status & time", () => {
  it("status == 200 passes; == 404 fails", () => {
    expect(evalAssertion(parseAssertion("status == 200"), rec()).ok).toBe(true);
    expect(evalAssertion(parseAssertion("status == 404"), rec()).ok).toBe(false);
  });
  it("status != and comparisons work", () => {
    expect(runAssertion("status != 500", rec()).ok).toBe(true);
    expect(runAssertion("status >= 200", rec()).ok).toBe(true);
    expect(runAssertion("status < 300", rec()).ok).toBe(true);
  });
  it("time < 1000 passes; time < 10 fails", () => {
    expect(runAssertion("time < 1000", rec()).ok).toBe(true);
    expect(runAssertion("time < 10", rec()).ok).toBe(false);
  });
});

describe("evalAssertion — body json-path", () => {
  it("compares booleans, strings and numbers", () => {
    expect(runAssertion("body.$.ok == true", rec()).ok).toBe(true);
    expect(runAssertion('body.$.user == "ada"', rec()).ok).toBe(true);
    expect(runAssertion("body.$.user == bob", rec()).ok).toBe(false);
    expect(runAssertion("body.$.data.items[0].id == 1", rec()).ok).toBe(true);
  });
  it("exists / empty", () => {
    expect(runAssertion("body.$.user exists", rec()).ok).toBe(true);
    expect(runAssertion("body.$.missing exists", rec()).ok).toBe(false);
    expect(runAssertion("body.$.missing empty", rec()).ok).toBe(true);
  });
  it("falls back to parsing the raw body when json is absent", () => {
    const r = rec({ json: undefined });
    expect(runAssertion("body.$.ok == true", r).ok).toBe(true);
  });
});

describe("evalAssertion — headers", () => {
  it("contains is case-insensitive", () => {
    expect(runAssertion("header.content-type contains json", rec()).ok).toBe(true);
    expect(runAssertion("header.content-type contains JSON", rec()).ok).toBe(true);
    expect(runAssertion("header.content-type contains xml", rec()).ok).toBe(false);
  });
  it("matches uses a regex", () => {
    expect(runAssertion("header.content-type matches charset=\\w+", rec()).ok).toBe(true);
  });
});

describe("captureValue", () => {
  it("captures scalar values from body paths and headers", () => {
    expect(captureValue("body.$.user", rec())).toBe("ada");
    expect(captureValue("status", rec())).toBe("200");
    expect(captureValue("header.content-type", rec())).toContain("application/json");
  });
  it("serialises objects", () => {
    expect(captureValue("body.$.data", rec())).toBe('{"items":[{"id":1}]}');
  });
  it("returns undefined for a missing path", () => {
    expect(captureValue("body.$.nope", rec())).toBeUndefined();
  });
});
