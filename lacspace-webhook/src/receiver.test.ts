import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { toRecord, createReceiver, normalizeForward } from "./receiver.js";

function fakeReq(method: string, url: string, headers: Record<string, string>): IncomingMessage {
  const req = new Readable() as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

describe("toRecord", () => {
  it("splits path/query and captures headers + body", () => {
    const rec = toRecord(
      fakeReq("post", "/hooks/x?a=1&a=2&b=3", { "content-type": "application/json" }),
      Buffer.from('{"ok":1}'),
    );
    expect(rec.method).toBe("POST");
    expect(rec.path).toBe("/hooks/x");
    expect(rec.query).toEqual({ a: ["1", "2"], b: "3" });
    expect(rec.body).toBe('{"ok":1}');
    expect(rec.bytes).toBe(8);
    expect(rec.contentType).toBe("application/json");
    expect(rec.id).toMatch(/^[0-9a-f]{12}$/);
  });
  it("handles a path with no query", () => {
    const rec = toRecord(fakeReq("GET", "/ping", {}), Buffer.alloc(0));
    expect(rec.path).toBe("/ping");
    expect(rec.query).toEqual({});
    expect(rec.contentType).toBeUndefined();
  });
});

describe("createReceiver (integration, ephemeral port)", () => {
  it("captures a POST and returns the default response", async () => {
    const captured: string[] = [];
    const { server, close } = createReceiver({ onRequest: (r) => captured.push(r.body) });
    await new Promise<void>((res) => server.listen(0, res));
    const addr = server.address();
    if (typeof addr !== "object" || addr === null) throw new Error("no address");

    const resp = await fetch(`http://127.0.0.1:${addr.port}/hooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hi":true}',
    });
    const json = (await resp.json()) as { ok?: boolean };

    expect(resp.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(captured).toEqual(['{"hi":true}']);

    await close();
  });

  it("404s a request to the wrong --path", async () => {
    const { server, close } = createReceiver({ path: "/only" });
    await new Promise<void>((res) => server.listen(0, res));
    const addr = server.address();
    if (typeof addr !== "object" || addr === null) throw new Error("no address");
    const resp = await fetch(`http://127.0.0.1:${addr.port}/elsewhere`, { method: "POST" });
    expect(resp.status).toBe(404);
    await close();
  });
});

describe("normalizeForward", () => {
  it("splits comma lists and arrays, trims, drops blanks", () => {
    expect(normalizeForward(undefined)).toEqual([]);
    expect(normalizeForward("http://a")).toEqual(["http://a"]);
    expect(normalizeForward("http://a, http://b")).toEqual(["http://a", "http://b"]);
    expect(normalizeForward(["http://a,http://b", " http://c "])).toEqual(["http://a", "http://b", "http://c"]);
  });
});

describe("createReceiver — rules + UI (integration, ephemeral port)", () => {
  it("answers from a matching mock rule and serves the inspector page", async () => {
    const { server, close } = createReceiver({
      ui: true,
      rules: [{ match: { path: "/pay", method: "POST" }, response: { status: 201, json: { paid: true }, headers: { "x-mock": "1" } } }],
    });
    await new Promise<void>((res) => server.listen(0, res));
    const addr = server.address();
    if (typeof addr !== "object" || addr === null) throw new Error("no address");
    const base = `http://127.0.0.1:${addr.port}`;

    const mock = await fetch(`${base}/pay`, { method: "POST", body: "{}" });
    expect(mock.status).toBe(201);
    expect(mock.headers.get("x-mock")).toBe("1");
    expect((await mock.json()).paid).toBe(true);

    const page = await fetch(`${base}/__inspector`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("lacspace-webhook");

    await close();
  });
});
