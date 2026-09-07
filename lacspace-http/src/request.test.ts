import { describe, it, expect, vi } from "vitest";
import { assembleRequest, sendRequest, toCurl } from "./request.js";
import type { RequestSpec } from "./request.js";

function header(spec: RequestSpec, name: string): string | undefined {
  return spec.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}

describe("assembleRequest", () => {
  it("defaults to GET, POST when a body is present", () => {
    expect(assembleRequest("https://a.test").method).toBe("GET");
    expect(assembleRequest("https://a.test", { data: "x" }).method).toBe("POST");
    expect(assembleRequest("https://a.test", { method: "put", data: "x" }).method).toBe("PUT");
  });

  it("builds a JSON body from -j shorthands with type coercion", () => {
    const spec = assembleRequest("https://a.test", { jsonKv: ["name=Ada", "admin:=true", "age:=30"] });
    expect(header(spec, "content-type")).toBe("application/json");
    expect(JSON.parse(spec.body!)).toEqual({ name: "Ada", admin: true, age: 30 });
  });

  it("uses a raw --json object verbatim", () => {
    const spec = assembleRequest("https://a.test", { json: '{"a":1}' });
    expect(spec.body).toBe('{"a":1}');
    expect(header(spec, "content-type")).toBe("application/json");
  });

  it("encodes form fields and query params", () => {
    const spec = assembleRequest("https://a.test/x", { form: ["a=1", "b=hi there"], query: ["q=cats"] });
    expect(spec.url).toBe("https://a.test/x?q=cats");
    expect(header(spec, "content-type")).toBe("application/x-www-form-urlencoded");
    expect(spec.body).toBe("a=1&b=hi+there");
  });

  it("adds bearer and basic auth headers", () => {
    expect(header(assembleRequest("https://a.test", { bearer: "TKN" }), "authorization")).toBe("Bearer TKN");
    const basic = header(assembleRequest("https://a.test", { user: "u:p" }), "authorization");
    expect(basic).toBe("Basic " + Buffer.from("u:p").toString("base64"));
  });

  it("appends query with & when the url already has one", () => {
    const spec = assembleRequest("https://a.test/x?a=1", { query: ["b=2"] });
    expect(spec.url).toBe("https://a.test/x?a=1&b=2");
  });
});

describe("toCurl", () => {
  it("renders method, headers and body", () => {
    const spec = assembleRequest("https://a.test", { method: "POST", json: '{"a":1}', headers: ["X-Test: 1"] });
    const curl = toCurl(spec, { followRedirects: true });
    expect(curl).toContain("curl -X POST");
    expect(curl).toContain("-H 'X-Test: 1'");
    expect(curl).toContain(`--data-raw '{"a":1}'`);
    expect(curl).toContain("'https://a.test'");
    expect(curl).toContain("-L");
  });

  it("masks credentials by default and reveals them with showSecrets", () => {
    const spec = assembleRequest("https://a.test", { bearer: "SECRET" });
    expect(toCurl(spec)).toContain("Bearer ***");
    expect(toCurl(spec)).not.toContain("SECRET");
    expect(toCurl(spec, { showSecrets: true })).toContain("Bearer SECRET");
  });
});

// ---- sendRequest (mocked fetch) -------------------------------------------

function jsonResponse(obj: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(obj), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("sendRequest", () => {
  it("returns a structured record with parsed JSON and timing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, n: 5 }));
    const rec = await sendRequest({ method: "GET", url: "https://a.test/x", headers: [] }, { fetchImpl });
    expect(rec.status).toBe(200);
    expect(rec.ok).toBe(true);
    expect(rec.json).toEqual({ ok: true, n: 5 });
    expect(rec.headers["content-type"]).toContain("application/json");
    expect(typeof rec.timeMs).toBe("number");
    expect(rec.size).toBeGreaterThan(0);
  });

  it("follows redirects and records the chain", async () => {
    const responses = [
      new Response("go", { status: 302, headers: { location: "/end" } }),
      jsonResponse({ done: true }),
    ];
    let i = 0;
    const fetchImpl = vi.fn(async () => responses[i++]!);
    const rec = await sendRequest({ method: "GET", url: "https://a.test/start", headers: [] }, { fetchImpl });
    expect(rec.redirected).toBe(true);
    expect(rec.redirectChain).toEqual(["https://a.test/start"]);
    expect(rec.url).toBe("https://a.test/end");
    expect(rec.json).toEqual({ done: true });
  });

  it("does not follow redirects when disabled", async () => {
    const fetchImpl = vi.fn(async () => new Response("go", { status: 302, headers: { location: "/end" } }));
    const rec = await sendRequest(
      { method: "GET", url: "https://a.test/start", headers: [] },
      { fetchImpl, followRedirects: false },
    );
    expect(rec.status).toBe(302);
    expect(rec.redirected).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honours maxRedirects", async () => {
    const fetchImpl = vi.fn(async () => new Response("go", { status: 301, headers: { location: "/loop" } }));
    const rec = await sendRequest(
      { method: "GET", url: "https://a.test/loop", headers: [] },
      { fetchImpl, maxRedirects: 2 },
    );
    // 1 initial + 2 redirects followed = 3 fetches, then stops on the 3rd 301.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(rec.status).toBe(301);
  });

  it("flags a cross-host redirect", async () => {
    const responses = [
      new Response("go", { status: 302, headers: { location: "https://other.test/x" } }),
      jsonResponse({ ok: true }),
    ];
    let i = 0;
    const fetchImpl = vi.fn(async () => responses[i++]!);
    const rec = await sendRequest({ method: "GET", url: "https://a.test/start", headers: [] }, { fetchImpl });
    expect(rec.crossHostRedirect).toBe(true);
  });

  it("caps the body at maxSize and marks it truncated", async () => {
    const big = "x".repeat(5000);
    const fetchImpl = vi.fn(async () => new Response(big, { status: 200, headers: { "content-type": "text/plain" } }));
    const rec = await sendRequest(
      { method: "GET", url: "https://a.test/big", headers: [] },
      { fetchImpl, maxSize: 1000 },
    );
    expect(rec.truncated).toBe(true);
    expect(rec.size).toBe(1000);
    expect(rec.body.length).toBe(1000);
  });

  it("maps an aborted fetch to a timeout error", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(
      sendRequest({ method: "GET", url: "https://a.test/slow", headers: [] }, { fetchImpl, timeoutMs: 5 }),
    ).rejects.toThrow(/timed out/i);
  });

  it("converts 303 to GET and drops the body", async () => {
    const seen: Array<{ method: string; body: unknown }> = [];
    const responses = [
      new Response("see other", { status: 303, headers: { location: "/result" } }),
      jsonResponse({ ok: true }),
    ];
    let i = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push({ method: String(init?.method), body: init?.body });
      return responses[i++]!;
    });
    await sendRequest({ method: "POST", url: "https://a.test/submit", headers: [], body: "payload" }, { fetchImpl });
    expect(seen[0]!.method).toBe("POST");
    expect(seen[1]!.method).toBe("GET");
    expect(seen[1]!.body).toBeUndefined();
  });
});
