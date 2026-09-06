import { describe, it, expect, vi, afterEach } from "vitest";
import { replayRequests, resolveTarget, buildHeaders } from "./replay.js";
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
