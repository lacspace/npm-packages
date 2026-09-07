import { describe, it, expect, vi } from "vitest";
import { parseHttpFile } from "./httpfile.js";
import { runAssertion } from "./assert.js";
import { sendRequest } from "./request.js";
import type { ResponseRecord } from "./request.js";
import { runHttpFile } from "./runner.js";

function rec(over: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    status: 200, statusText: "OK",
    headers: { "content-type": "application/json" },
    timeMs: 5, size: 10, body: '{"user":"ada","n":3}',
    json: { user: "ada", n: 3 },
    url: "https://api.test/me",
    redirected: false, redirectChain: [], ok: true, truncated: false, crossHostRedirect: false,
    ...over,
  };
}

describe("@expect directive (assert alias)", () => {
  it("is parsed as an assertion in the leading block", () => {
    const [r] = parseHttpFile(["# @expect status == 200", "GET https://a.test/x"].join("\n"));
    expect(r!.assertions).toEqual([{ expr: "status == 200" }]);
  });

  it("is parsed after the body too", () => {
    const src = [
      "POST https://a.test/x",
      "Content-Type: application/json",
      "",
      '{"a":1}',
      "# @expect status == 201",
    ].join("\n");
    const [r] = parseHttpFile(src);
    expect(r!.assertions).toEqual([{ expr: "status == 201" }]);
    expect(r!.body).toBe('{"a":1}');
  });
});

describe("json.<path> LHS sugar", () => {
  it("resolves the same as body.$.<path>", () => {
    expect(runAssertion('json.user == "ada"', rec()).ok).toBe(true);
    expect(runAssertion("json.n == 3", rec()).ok).toBe(true);
    expect(runAssertion('json.user == "bob"', rec()).ok).toBe(false);
  });

  it("bare `json` returns the whole parsed body", () => {
    expect(runAssertion("json exists", rec()).ok).toBe(true);
    expect(runAssertion("json exists", rec({ json: undefined, body: "" })).ok).toBe(false);
  });
});

describe("sendRequest retry", () => {
  it("retries retryable statuses then succeeds, with an injected sleep", async () => {
    const statuses = [503, 503, 200];
    let i = 0;
    const fetchImpl = vi.fn(async () =>
      new Response("x", { status: statuses[i++]!, headers: { "content-type": "text/plain" } }),
    );
    const slept: number[] = [];
    const recv = await sendRequest(
      { method: "GET", url: "https://a.test/flaky", headers: [] },
      {
        fetchImpl,
        retry: { retries: 3, delayMs: 10, jitter: false },
        sleepImpl: async (ms) => { slept.push(ms); },
      },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(recv.status).toBe(200);
    expect(recv.attempts).toBe(3);
    expect(slept).toEqual([10, 20]);
  });

  it("throws after exhausting retries on a persistent network error", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    await expect(
      sendRequest(
        { method: "GET", url: "https://a.test/down", headers: [] },
        { fetchImpl, retry: 2, sleepImpl: async () => {} },
      ),
    ).rejects.toThrow(/ECONNREFUSED/);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("does not retry by default (backward-compatible)", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    const r = await sendRequest({ method: "GET", url: "https://a.test/x", headers: [] }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r.attempts).toBe(1);
  });

  it("flows retry through runHttpFile", async () => {
    const statuses = [500, 200];
    let i = 0;
    const fetchImpl = vi.fn(async () =>
      new Response('{"ok":true}', { status: statuses[i++]!, headers: { "content-type": "application/json" } }),
    );
    const result = await runHttpFile(
      ["GET https://a.test/x", "# @expect status == 200"].join("\n"),
      { fetchImpl, retry: { retries: 1, delayMs: 1, jitter: false }, sleepImpl: async () => {} },
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
