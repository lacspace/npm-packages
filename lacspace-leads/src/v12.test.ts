import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPusher,
  describePushError,
  formatPreflight,
  formatPushSummary,
  preflightPush,
  readPushError,
} from "./push.js";
import { assertConfig } from "./config.js";
import type { Lead } from "./types.js";

const TOKEN = "sk-secret-token-456";
const L = (i: number): Lead => ({ name: `Cafe ${i}` });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Hit { method: string; headers: IncomingMessage["headers"]; body: string }
let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r(undefined)); })));
  servers = [];
});

async function endpoint(handler: (hit: Hit, n: number, res: ServerResponse) => void): Promise<{ url: string; hits: Hit[] }> {
  const hits: Hit[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const hit = { method: req.method ?? "", headers: req.headers, body };
      hits.push(hit);
      handler(hit, hits.length, res);
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webmail/leads/import`, hits };
}
const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void =>
  void res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
const fast = { retryDelaysMs: [5, 5, 5], intervalMs: 60_000, batchSize: 1 };

/** Run the CLI from source; resolves with exit code + combined output. */
function cli(args: string[], env: Record<string, string> = {}, stdinText = ""): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, "node_modules/vite-node/vite-node.mjs"), join(ROOT, "src/cli.ts"), "--", ...args], {
      cwd: ROOT, env: { ...process.env, NO_COLOR: "1", ...env }, stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.stdin.end(stdinText);
    child.on("close", (code) => resolve({ code, out }));
  });
}

describe("push failure details (1.9.1)", () => {
  it("reads JSON error + code, a nested error object, or the start of a text body", () => {
    expect(readPushError(429, '{"error":"Too many requests","code":"RATE_LIMITED"}')).toEqual({ status: 429, code: "RATE_LIMITED", message: "Too many requests" });
    expect(readPushError(422, '{"error":{"message":"bad lead","code":"INVALID"}}')).toEqual({ status: 422, code: "INVALID", message: "bad lead" });
    const long = "Bad\u0007 gateway\r\n" + "x".repeat(500);
    const e = readPushError(502, long);
    expect(e.message!.length).toBeLessThanOrEqual(120);
    expect(e.message).toMatch(/^Bad gateway x+…$/);
    expect(e.message).not.toMatch(/[\u0000-\u001f]/);
    expect(readPushError(500, `{"error":"token ${TOKEN} is bad"}`, TOKEN).message).toBe("token *** is bad");
    expect(readPushError(500, "")).toEqual({ status: 500 });
    expect(describePushError({ status: 0, message: "ECONNREFUSED" })).toBe("network error (ECONNREFUSED)");
  });

  it("the end summary carries the last status, code and error text", async () => {
    const warns: string[] = [];
    const { url } = await endpoint((h, n, res) => {
      const p = JSON.parse(h.body) as { done: boolean };
      if (p.done || n === 1) return json(res, 200, { ok: true });
      json(res, 429, { error: "Too many requests", code: "RATE_LIMITED" }, { "Retry-After": "0" });
    });
    const p = createPusher({ url, token: TOKEN, onWarn: (m) => warns.push(m), ...fast });
    p.push(L(1));
    await new Promise((r) => setTimeout(r, 50));
    p.push(L(2));
    const st = await p.finish();
    expect(formatPushSummary(st)).toBe('push: sent 1 lead in 1 batch, failed 1 (last: 429 RATE_LIMITED "Too many requests"), not rejected');
    expect(warns.join("\n")).toMatch(/429 RATE_LIMITED "Too many requests"/);
    expect([...warns, formatPushSummary(st), JSON.stringify(st)].join("\n")).not.toContain(TOKEN);
  });

  it("truncates a text body in the 4xx warning and summary", async () => {
    const warns: string[] = [];
    const { url } = await endpoint((h, _n, res) => {
      if ((JSON.parse(h.body) as { done: boolean }).done) return json(res, 200, {});
      res.writeHead(418, { "Content-Type": "text/plain" }).end("I'm a teapot\n" + "t".repeat(400));
    });
    const p = createPusher({ url, onWarn: (m) => warns.push(m), ...fast });
    p.push(L(1));
    const st = await p.finish();
    expect(st.lastError?.status).toBe(418);
    expect(st.lastError!.message!.length).toBeLessThanOrEqual(120);
    expect(warns[0]).toMatch(/^push: endpoint answered HTTP 418 "I'm a teapot t+…"; dropping/);
    expect(formatPushSummary(st)).toMatch(/failed 1 \(last: 418 "I'm a teapot t+…"\)/);
  });

  it("401 names the status and code; the token never shows", async () => {
    const warns: string[] = [];
    const { url } = await endpoint((_h, _n, res) => json(res, 401, { error: `bad ${TOKEN}`, code: "BAD_TOKEN" }));
    const p = createPusher({ url, token: TOKEN, file: "out.csv", onWarn: (m) => warns.push(m), ...fast });
    p.push(L(1));
    const st = await p.finish();
    expect(warns).toContain("push rejected (401 BAD_TOKEN): token invalid or expired, leads are still being saved to out.csv");
    expect(formatPushSummary(st)).toMatch(/REJECTED \(401 BAD_TOKEN\)/);
    expect([...warns, formatPushSummary(st), JSON.stringify(st)].join("\n")).not.toContain(TOKEN);
  });
});

describe("push preflight (1.9.1)", () => {
  it("200 with search.name: connected, with the token expiry", async () => {
    const { url, hits } = await endpoint((_h, _n, res) => json(res, 200, { search: { name: "Kathmandu restaurants" }, expiresAt: "2026-10-08T12:00:00Z" }));
    const r = await preflightPush({ url, token: TOKEN });
    expect(hits[0]!.method).toBe("GET");
    expect(hits[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(hits[0]!.headers["user-agent"]).toMatch(/^lacspace-leads\//);
    expect(r).toMatchObject({ kind: "connected", status: 200, searchName: "Kathmandu restaurants" });
    const f = formatPreflight(r);
    expect(f.fatal).toBe(false);
    expect(f.line).toMatch(/^push: connected, search "Kathmandu restaurants" \(token valid until .+\)$/);
    expect(formatPreflight({ kind: "connected", status: 200, searchName: "X" }).line).toBe('push: connected, search "X"');
  });

  it("401/403: fatal, with status and code, never the token", async () => {
    const { url } = await endpoint((_h, _n, res) => json(res, 401, { error: "expired", code: "BAD_TOKEN" }));
    const r = await preflightPush({ url, token: TOKEN });
    expect(r).toMatchObject({ kind: "rejected", status: 401, code: "BAD_TOKEN" });
    const f = formatPreflight(r);
    expect(f).toEqual({ fatal: true, line: "push: token rejected (401 BAD_TOKEN), copy a fresh command from your portal" });
    expect(JSON.stringify(r) + f.line).not.toContain(TOKEN);
  });

  it("404 / 405 / other / non-JSON / network error: carry on silently", async () => {
    for (const [status, body] of [[404, "nope"], [405, ""], [500, "{}"], [200, "<html>ok</html>"], [200, '{"ok":true}']] as const) {
      const { url } = await endpoint((_h, _n, res) => void res.writeHead(status).end(body));
      const r = await preflightPush({ url });
      expect(r.kind).toBe("unknown");
      expect(formatPreflight(r)).toEqual({ fatal: false });
    }
    const r = await preflightPush({ url: "http://127.0.0.1:1/x" });
    expect(r).toEqual({ kind: "unknown", status: 0 });
  });

  it("config accepts push.preflight: false", () => {
    expect(() => assertConfig({ searches: [{ type: "x" }], push: { url: "https://x.y/z", preflight: false } })).not.toThrow();
    expect(() => assertConfig({ searches: [{ type: "x" }], push: { url: "https://x.y/z", preflight: "no" } })).toThrow(/preflight/);
  });
});

describe("push preflight in the CLI (1.9.1)", () => {
  it("401 exits 1 before scraping, without printing the token", async () => {
    const { url, hits } = await endpoint((_h, _n, res) => json(res, 401, { error: "expired", code: "BAD_TOKEN" }));
    const { code, out } = await cli(["cafes", "--city", "Kathmandu", "-y", "--push", url], { LACSPACE_LEADS_PUSH_TOKEN: TOKEN });
    expect(code).toBe(1);
    expect(out).toContain("push: token rejected (401 BAD_TOKEN), copy a fresh command from your portal");
    expect(out).not.toContain(TOKEN);
    expect(out).not.toMatch(/writing live|Opening|browser/i);
    expect(hits.map((h) => h.method)).toEqual(["GET"]);
  }, 30_000);

  it("200 prints the search name; --push-no-preflight sends no GET", async () => {
    const { url, hits } = await endpoint((_h, _n, res) => json(res, 200, { search: { name: "Leads board" } }));
    // Answer "n" at the browser prompt so nothing is scraped.
    const a = await cli(["cafes", "--city", "Kathmandu", "--push", url], { LACSPACE_LEADS_PUSH_TOKEN: TOKEN }, "n\n");
    expect(a.out).toContain('push: connected, search "Leads board"');
    expect(a.out).toContain("cancelled");
    expect(hits).toHaveLength(1);
    const b = await cli(["cafes", "--city", "Kathmandu", "--push", url, "--push-no-preflight"], { LACSPACE_LEADS_PUSH_TOKEN: TOKEN }, "n\n");
    expect(b.out).toContain("cancelled");
    expect(b.out).not.toContain("connected");
    expect(hits).toHaveLength(1); // still just the first run's GET
  }, 60_000);

  it("404 carries on to the run", async () => {
    const { url, hits } = await endpoint((_h, _n, res) => void res.writeHead(404).end("not found"));
    const { out } = await cli(["cafes", "--city", "Kathmandu", "--push", url], {}, "n\n");
    expect(hits).toHaveLength(1);
    expect(out).toContain("cancelled"); // reached the browser prompt
    expect(out).not.toMatch(/token rejected/);
  }, 30_000);
});
