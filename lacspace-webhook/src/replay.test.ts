import { describe, it, expect, vi, afterEach } from "vitest";
import {
  replayRequests, resolveTarget, buildHeaders,
  parseFilter, matchFilter, parseRewrite, applyReplayTransform,
} from "./replay.js";
import type { CapturedRequest } from "./capture.js";

function rec(over: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "1", at: "2026-09-06T00:00:00.000Z", method: "POST",
    path: "/hooks", url: "/hooks", query: {},
    headers: { "content-type": "application/json", host: "example.com", "content-length": "2" },
    body: '{"a":1}', contentType: "application/json", bytes: 7,
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("resolveTarget", () => {
  it("joins base origin + captured path", () => {
    expect(resolveTarget("http://localhost:3000", rec({ url: "/hooks/x?y=1" }))).toBe("http://localhost:3000/hooks/x?y=1");
  });
  it("appends under a base path", () => {
    expect(resolveTarget("http://localhost:3000/api", rec({ url: "/webhook" }))).toBe("http://localhost:3000/api/webhook");
  });
});

describe("buildHeaders", () => {
  it("drops transport headers but keeps the rest", () => {
    const h = buildHeaders(rec());
    expect(h["content-type"]).toBe("application/json");
    expect(h.host).toBeUndefined();
    expect(h["content-length"]).toBeUndefined();
  });
});

describe("replayRequests", () => {
  it("builds the right method, url, headers and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const out = await replayRequests([rec()], { to: "http://localhost:3000" });

    expect(out).toEqual([{ status: 200 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/hooks");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).host).toBeUndefined();
  });

  it("omits a body for GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    await replayRequests([rec({ method: "GET", body: "" })], { to: "http://localhost:3000" });
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
  });

  it("replays in order and returns each status", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      seen.push(init.method!);
      return Promise.resolve({ status: seen.length === 1 ? 200 : 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await replayRequests(
      [rec({ method: "POST" }), rec({ method: "PUT" })],
      { to: "http://localhost:3000" },
    );

    expect(seen).toEqual(["POST", "PUT"]);
    expect(out).toEqual([{ status: 200 }, { status: 500 }]);
  });
});

describe("parseFilter + matchFilter", () => {
  it("parses a comma expression", () => {
    expect(parseFilter("method=POST,path=/x")).toEqual({ method: "POST", path: "/x" });
    expect(parseFilter("body=charge,pathPrefix=/api")).toEqual({ bodyContains: "charge", pathPrefix: "/api" });
  });
  it("matches method/path/prefix/body, with a path glob", () => {
    expect(matchFilter(rec(), { method: "POST" })).toBe(true);
    expect(matchFilter(rec(), { method: "GET" })).toBe(false);
    expect(matchFilter(rec({ path: "/hooks/a" }), { path: "/hooks/*" })).toBe(true);
    expect(matchFilter(rec(), { pathPrefix: "/ho" })).toBe(true);
    expect(matchFilter(rec({ body: "charge me" }), { bodyContains: "charge" })).toBe(true);
    expect(matchFilter(rec(), undefined)).toBe(true);
  });
});

describe("parseRewrite + applyReplayTransform", () => {
  it("parses a=>b and a::b", () => {
    expect(parseRewrite("old=>new")).toEqual({ find: "old", replace: "new" });
    expect(parseRewrite("old::new")).toEqual({ find: "old", replace: "new" });
  });
  it("replaces the body and applies rewrites without mutating the input", () => {
    const original = rec({ body: '{"env":"prod"}' });
    const out = applyReplayTransform(original, { rewrite: [{ find: "prod", replace: "test" }] });
    expect(out.body).toBe('{"env":"test"}');
    expect(out.bytes).toBe(Buffer.byteLength(out.body));
    expect(original.body).toBe('{"env":"prod"}'); // unchanged
  });
  it("sets a whole body and overrides headers case-insensitively", () => {
    const out = applyReplayTransform(rec(), { setBody: "hello", headers: { "Content-Type": "text/plain" } });
    expect(out.body).toBe("hello");
    const keys = Object.keys(out.headers).filter((k) => k.toLowerCase() === "content-type");
    expect(keys).toHaveLength(1);
    expect(out.headers[keys[0]!]).toBe("text/plain");
  });
});

describe("replayRequests — filter, transform, assertions, retry", () => {
  it("only sends filtered records", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const out = await replayRequests(
      [rec({ method: "GET", body: "" }), rec({ method: "POST" })],
      { to: "http://localhost:3000", filter: { method: "POST" } },
    );
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies a body transform before sending", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await replayRequests([rec({ body: "prod" })], { to: "http://localhost:3000", rewrite: [{ find: "prod", replace: "test" }] });
    expect(fetchMock.mock.calls[0]![1].body).toBe("test");
  });

  it("asserts expected status and contained text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: () => Promise.resolve('{"ok":true}') });
    vi.stubGlobal("fetch", fetchMock);
    const out = await replayRequests([rec()], { to: "http://localhost:3000", expectStatus: 200, expectContains: "ok" });
    expect(out[0]!.ok).toBe(true);

    const out2 = await replayRequests([rec()], { to: "http://localhost:3000", expectStatus: 201 });
    expect(out2[0]!.ok).toBe(false);
    expect(out2[0]!.reason).toMatch(/expected status 201/);
  });

  it("retries a 500 then succeeds, recording attempts", async () => {
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve({ status: ++n < 2 ? 500 : 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await replayRequests([rec()], { to: "http://localhost:3000", retry: 2, backoff: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out[0]!.status).toBe(200);
    expect(out[0]!.attempts).toBe(2);
  });
});
