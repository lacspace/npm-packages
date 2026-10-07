import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPusher,
  formatPushSummary,
  maskUrl,
  parseRetryAfter,
  resolvePush,
  validatePushUrl,
  PUSH_TOKEN_ENV,
  VERSION,
  type PushPayload,
} from "./push.js";
import { assertConfig } from "./config.js";
import { createLiveWriter } from "./live.js";
import { readRows } from "./convert.js";
import { rowsToLeads } from "./export.js";
import type { Lead } from "./types.js";

const TOKEN = "sk-secret-token-123";
const L = (i: number): Lead => ({ name: `Cafe ${i}`, phone: `+97798000000${i}`, website: `https://cafe${i}.com.np` });
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Hit { body: PushPayload; headers: IncomingMessage["headers"]; at: number }
type Handler = (hit: Hit, n: number, res: ServerResponse) => void;

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r(undefined)); })));
  servers = [];
});

/** A local endpoint that records every POST. `handler` decides the reply (default 200). */
async function endpoint(handler?: Handler): Promise<{ url: string; hits: Hit[] }> {
  const hits: Hit[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const hit: Hit = { body: JSON.parse(raw) as PushPayload, headers: req.headers, at: Date.now() };
      hits.push(hit);
      if (handler) handler(hit, hits.length, res);
      else res.writeHead(200).end("{}");
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/leads/import`, hits };
}

const fast = { retryDelaysMs: [10, 10, 10], intervalMs: 60_000 };
const leadsOf = (hits: Hit[]): string[] => hits.flatMap((h) => h.body.leads.map((l) => l.name!));

describe("push: URL safety (1.9.0)", () => {
  it("allows https anywhere and http only on localhost / 127.0.0.1 / [::1]", () => {
    expect(validatePushUrl("https://api.lacspace.com/api/webmail/leads/import").hostname).toBe("api.lacspace.com");
    expect(() => validatePushUrl("http://localhost:3000/x")).not.toThrow();
    expect(() => validatePushUrl("http://127.0.0.1:8080/x")).not.toThrow();
    expect(() => validatePushUrl("http://[::1]:8080/x")).not.toThrow();
    expect(() => validatePushUrl("http://api.lacspace.com/x")).toThrow(/https/);
    expect(() => validatePushUrl("http://127.0.0.2/x")).toThrow(/https/);
    expect(() => validatePushUrl("http://localhost.evil.com/x")).toThrow(/https/);
    expect(() => validatePushUrl("ftp://localhost/x")).toThrow(/https/);
    expect(() => validatePushUrl("file:///etc/passwd")).toThrow(/https/);
    expect(() => validatePushUrl("not a url")).toThrow(/not valid/);
    expect(() => validatePushUrl("")).toThrow(/needs a URL/);
    expect(() => createPusher({ url: "http://example.com/x" })).toThrow(/https/);
  });
  it("masks credentials and query strings when printing a URL", () => {
    expect(maskUrl("https://user:pw@crm.example.com/hook?token=abc")).toBe("https://crm.example.com/hook?…");
  });
});

describe("push: resolving flags, config and env", () => {
  it("precedence is CLI flag, then config, then env", () => {
    const config = { url: "https://cfg.example.com/x", token: "cfg-token" };
    const env = { [PUSH_TOKEN_ENV]: "env-token" };
    expect(resolvePush({ flagUrl: "https://flag.example.com/x", flagToken: "flag-token", config, env })).toEqual({ url: "https://flag.example.com/x", token: "flag-token" });
    expect(resolvePush({ config, env })).toEqual({ url: "https://cfg.example.com/x", token: "cfg-token" });
    expect(resolvePush({ flagUrl: "https://flag.example.com/x", env })).toEqual({ url: "https://flag.example.com/x", token: "env-token" });
    expect(resolvePush({ flagUrl: "https://flag.example.com/x", env: {} })).toEqual({ url: "https://flag.example.com/x" });
    expect(resolvePush({ env })).toBeUndefined(); // a token alone doesn't turn push on
  });
  it("parses a push block from --config JSON", () => {
    const cfg = JSON.parse('{ "searches": [{ "type": "cafes", "city": "Kathmandu" }], "push": { "url": "https://api.lacspace.com/api/webmail/leads/import", "token": "t0k" } }');
    assertConfig(cfg);
    expect(resolvePush({ config: cfg.push, env: {} })).toEqual({ url: "https://api.lacspace.com/api/webmail/leads/import", token: "t0k" });
    expect(() => assertConfig({ searches: [{ type: "x" }], push: "https://x" })).toThrow(/push/);
    expect(() => assertConfig({ searches: [{ type: "x" }], push: { url: 5 } })).toThrow(/push.url/);
  });
  it("Retry-After: seconds or HTTP date, capped at 60s", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("600")).toBe(60_000);
    const now = Date.parse("2026-10-07T10:00:00Z");
    expect(parseRetryAfter("Wed, 07 Oct 2026 10:00:05 GMT", 60_000, now)).toBe(5000);
    expect(parseRetryAfter("Wed, 07 Oct 2026 11:00:00 GMT", 60_000, now)).toBe(60_000);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("push: batching and payload", () => {
  it("flushes every 10 leads, with headers, search, run and seq", async () => {
    const { url, hits } = await endpoint();
    const p = createPusher({ url, token: TOKEN, search: { type: "cafes", city: "Kathmandu", target: 300 }, ...fast });
    for (let i = 1; i <= 25; i++) { p.push(L(i)); if (i % 10 === 0) await wait(60); }
    await wait(100);
    expect(hits.map((h) => h.body.leads.length)).toEqual([10, 10]); // the last 5 wait for the timer / finish
    const h = hits[0]!;
    expect(h.headers["content-type"]).toBe("application/json");
    expect(h.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(h.headers["user-agent"]).toBe(`lacspace-leads/${VERSION}`);
    expect(h.body.search).toEqual({ type: "cafes", city: "Kathmandu", area: null, target: 300 });
    expect(h.body.done).toBe(false);
    expect(h.body.run).toMatch(/^[0-9a-f-]{36}$/);
    expect(hits.map((x) => x.body.seq)).toEqual([1, 2]);
    expect(new Set(hits.map((x) => x.body.run)).size).toBe(1);
    await p.finish();
  });

  it("flushes on the interval when fewer than 10 are waiting", async () => {
    const { url, hits } = await endpoint();
    const p = createPusher({ url, intervalMs: 80, retryDelaysMs: [10] });
    p.push(L(1));
    p.push(L(2));
    await wait(30);
    expect(hits).toHaveLength(0);
    await wait(150);
    expect(hits).toHaveLength(1);
    expect(leadsOf(hits)).toEqual(["Cafe 1", "Cafe 2"]);
    expect(hits[0]!.headers.authorization).toBeUndefined(); // no token, no header
    await p.finish();
  });

  it("finish() flushes the rest, then sends one done POST with stats", async () => {
    const { url, hits } = await endpoint();
    const p = createPusher({ url, token: TOKEN, ...fast });
    for (let i = 1; i <= 13; i++) p.push(L(i));
    const stats = { total: 13, withPhone: 13, withWebsite: 13, withEmail: 0, withValidEmail: 0, withSocial: 0 };
    const st = await p.finish(stats);
    expect(hits.map((h) => h.body.leads.length)).toEqual([10, 3, 0]);
    const last = hits[2]!.body;
    expect(last.done).toBe(true);
    expect(last.seq).toBe(3);
    expect(last.stats).toEqual(stats);
    expect(leadsOf(hits)).toHaveLength(13);
    expect(st).toMatchObject({ sent: 13, batches: 2, failed: 0, dropped: 0, rejected: false, doneSent: true, pending: 0 });
    expect(formatPushSummary(st)).toBe("push: sent 13 leads in 2 batches, failed 0, not rejected");
    p.push(L(99)); // after finish: ignored
    expect(p.stats().pending).toBe(0);
  });
});

describe("push: failures", () => {
  it("retries a 500, then succeeds", async () => {
    const { url, hits } = await endpoint((_h, n, res) => res.writeHead(n <= 2 ? 500 : 200).end());
    const p = createPusher({ url, ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    const st = await p.finish();
    expect(hits.map((h) => h.body.seq)).toEqual([1, 1, 1, 2]); // same batch retried, then done
    expect(st).toMatchObject({ sent: 10, batches: 1, failed: 0 });
  });

  it("gives up after 3 retries and keeps going", async () => {
    const warns: string[] = [];
    const { url, hits } = await endpoint((h, _n, res) => res.writeHead(h.body.done ? 200 : 503).end());
    const p = createPusher({ url, onWarn: (m) => warns.push(m), ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    const st = await p.finish();
    expect(hits.filter((h) => !h.body.done)).toHaveLength(4); // 1 try + 3 retries
    expect(st).toMatchObject({ sent: 0, failed: 10, doneSent: true });
    expect(warns.some((w) => /after retries/.test(w))).toBe(true);
  });

  it("honours Retry-After on 429", async () => {
    const { url, hits } = await endpoint((_h, n, res) => {
      if (n === 1) res.writeHead(429, { "Retry-After": "1" }).end();
      else res.writeHead(200).end();
    });
    const p = createPusher({ url, ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    await wait(1400);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const gap = hits[1]!.at - hits[0]!.at;
    expect(gap).toBeGreaterThanOrEqual(900); // waited the server's 1s, not the 10ms backoff
    expect((await p.finish()).sent).toBe(10);
  });

  it("caps 429 retries at 3", async () => {
    const { url, hits } = await endpoint((h, _n, res) => res.writeHead(h.body.done ? 200 : 429, { "Retry-After": "0" }).end());
    const p = createPusher({ url, ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    const st = await p.finish();
    expect(hits.filter((h) => !h.body.done)).toHaveLength(4);
    expect(st.failed).toBe(10);
  });

  it("401 stops pushing for the run while the file keeps being written; the token never leaks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "leads-push-"));
    const file = join(dir, "leads.csv");
    const logs: string[] = [];
    const { url, hits } = await endpoint((_h, _n, res) => res.writeHead(401).end());
    const writer = createLiveWriter({ file, format: "csv", fields: ["name", "phone", "website"] });
    const p = createPusher({ url, token: TOKEN, file, onWarn: (m) => logs.push(m), ...fast });
    for (let i = 1; i <= 30; i++) {
      if (writer.add(L(i))) p.push(L(i)); // exactly how the CLI wires onResult
      if (i === 10) await wait(100);
    }
    writer.finish();
    const st = await p.finish({ total: 30, withPhone: 30, withWebsite: 30, withEmail: 0, withValidEmail: 0, withSocial: 0 });
    expect(hits).toHaveLength(1); // one rejected batch, nothing after (no done POST either)
    expect(st.rejected).toBe(true);
    expect(st.sent).toBe(0);
    expect(logs.filter((m) => m.startsWith("push rejected"))).toEqual([`push rejected: token invalid or expired, leads are still being saved to ${file}`]);
    expect(rowsToLeads(await readRows(file))).toHaveLength(30);
    const everything = [...logs, formatPushSummary(st), JSON.stringify(st)].join("\n");
    expect(everything).not.toContain(TOKEN);
    expect(formatPushSummary(st)).toMatch(/REJECTED/);
  });

  it("403 also rejects", async () => {
    const { url } = await endpoint((_h, _n, res) => res.writeHead(403).end());
    const p = createPusher({ url, token: TOKEN, ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    expect((await p.finish()).rejected).toBe(true);
  });

  it("other 4xx: one warning per status, the batch is dropped, pushing carries on", async () => {
    const warns: string[] = [];
    const { url, hits } = await endpoint((h, n, res) => res.writeHead(h.body.done ? 200 : n <= 2 ? 422 : 200).end());
    const p = createPusher({ url, token: TOKEN, onWarn: (m) => warns.push(m), ...fast });
    for (let i = 1; i <= 30; i++) { p.push(L(i)); if (i % 10 === 0) await wait(60); }
    const st = await p.finish();
    expect(hits.filter((h) => !h.body.done).map((h) => h.body.seq)).toEqual([1, 2, 3]); // no retries on 422
    expect(warns.filter((w) => /422/.test(w))).toHaveLength(1);
    expect(st).toMatchObject({ sent: 10, batches: 1, failed: 20, rejected: false, doneSent: true });
    expect(warns.join("\n")).not.toContain(TOKEN);
  });

  it("never blocks: a slow endpoint merges batches and the queue is capped", async () => {
    const warns: string[] = [];
    const { url, hits } = await endpoint((_h, _n, res) => setTimeout(() => res.writeHead(200).end(), 150));
    const p = createPusher({ url, maxQueue: 25, maxBatch: 100, onWarn: (m) => warns.push(m), ...fast });
    const t0 = Date.now();
    for (let i = 1; i <= 60; i++) p.push(L(i)); // 10 go out at once, 25 wait, 25 are dropped
    expect(Date.now() - t0).toBeLessThan(50); // push() returns immediately
    expect(p.stats().dropped).toBe(25);
    const st = await p.finish(undefined, { timeoutMs: 3000 });
    expect(warns.filter((w) => /too slow/.test(w))).toHaveLength(1);
    const sizes = hits.filter((h) => !h.body.done).map((h) => h.body.leads.length);
    expect(sizes).toEqual([10, 25]); // the waiting leads merged into one request
    expect(st).toMatchObject({ sent: 35, dropped: 25, failed: 0 });
    expect(formatPushSummary(st)).toMatch(/dropped 25/);
  });

  it("finish() is bounded even when the endpoint hangs", async () => {
    const { url } = await endpoint(() => { /* never answers */ });
    const p = createPusher({ url, ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    const t0 = Date.now();
    const st = await p.finish(undefined, { timeoutMs: 300 });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(st).toMatchObject({ sent: 0, failed: 10, doneSent: false });
  });

  it("network errors are retried and never throw", async () => {
    const p = createPusher({ url: "http://127.0.0.1:1/nothing-here", ...fast });
    for (let i = 1; i <= 10; i++) p.push(L(i));
    const st = await p.finish(undefined, { timeoutMs: 2000 });
    expect(st).toMatchObject({ sent: 0, failed: 10 });
  });
});

describe("push: version", () => {
  it("VERSION matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
