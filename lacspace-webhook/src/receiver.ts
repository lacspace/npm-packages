/**
 * The local webhook receiver: an `http.Server` that accepts any method/path,
 * captures each request, optionally verifies a signature, optionally forwards
 * to one or more local URLs, optionally answers from mock rules, optionally
 * serves a live web inspector, and returns a response.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { CapturedRequest } from "./capture.js";
import { parseQuery } from "./capture.js";
import { verifySignature } from "./verify.js";
import type { SignatureScheme, VerifyResult } from "./verify.js";
import type { Rule } from "./rules.js";
import { findRule, resolveResponse } from "./rules.js";
import { UI_PAGE, UI_EVENTS, inspectorHtml, sseFrame } from "./ui.js";
import type { UiEvent } from "./ui.js";

/** One forward attempt's outcome. */
export interface ForwardResult {
  target: string;
  status?: number;
  ok: boolean;
  attempts: number;
  error?: string;
}

/** Options controlling a receiver. */
export interface ReceiverOptions {
  /** Only accept this exact path (default: accept any path). */
  path?: string;
  /** Forward each request to this URL (or several) and relay the first response. */
  forward?: string | string[];
  /** Retry a failed forward this many times with exponential backoff (default 0). */
  forwardRetry?: number;
  /** Response status when not forwarding/mocking (default 200). */
  status?: number;
  /** Response body when not forwarding/mocking (default `{"ok":true}`). */
  body?: string;
  /** Response `content-type` when not forwarding/mocking (default `application/json`). */
  contentType?: string;
  /** Delay (ms) before sending a canned / mock-default response. */
  delay?: number;
  /** Mock rules: first match wins and overrides forward/default. */
  rules?: Rule[];
  /** Secret used to verify signatures (with `verify`). */
  secret?: string;
  /** Signature scheme to verify (`"auto"` infers from headers). Requires `secret` unless auto has none. */
  verify?: SignatureScheme;
  /** For the generic `hmac-sha256`/`sha1` schemes: the signature header name. */
  signatureHeader?: string;
  /** Maximum body bytes to buffer before rejecting (default 5 MB). */
  maxBodyBytes?: number;
  /** Serve the live web inspector at `/__inspector` and stream captures over SSE. */
  ui?: boolean;
  /** Called for every captured request (after verification, before responding). */
  onRequest?: (record: CapturedRequest, verify?: VerifyResult) => void;
  /** Called with the outcome of each forward target (when forwarding). */
  onForward?: (record: CapturedRequest, results: ForwardResult[]) => void;
}

/** A running receiver handle. */
export interface Receiver {
  server: Server;
  /** Stop the server. Resolves once closed. */
  close: () => Promise<void>;
}

const DEFAULT_MAX_BODY = 5 * 1024 * 1024;

function shortId(): string {
  return randomBytes(6).toString("hex");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Normalize `forward` (string | string[] | comma-list) into a clean array. */
export function normalizeForward(forward: string | string[] | undefined): string[] {
  if (!forward) return [];
  const arr = Array.isArray(forward) ? forward : [forward];
  return arr
    .flatMap((f) => f.split(","))
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/** Read the whole request body into a Buffer, enforcing a size cap. */
function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Build a {@link CapturedRequest} from a Node request + its raw body. */
export function toRecord(req: IncomingMessage, rawBody: Buffer): CapturedRequest {
  const rawUrl = req.url ?? "/";
  const qIdx = rawUrl.indexOf("?");
  const path = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
  const query = qIdx === -1 ? {} : parseQuery(rawUrl.slice(qIdx + 1));
  const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : undefined;
  const record: CapturedRequest = {
    id: shortId(),
    at: new Date().toISOString(),
    method: (req.method ?? "GET").toUpperCase(),
    path,
    url: rawUrl,
    query,
    headers: { ...req.headers },
    body: rawBody.toString("utf8"),
    bytes: rawBody.length,
  };
  if (contentType !== undefined) record.contentType = contentType;
  return record;
}

/** Compute the outbound target URL for forwarding a capture to a base URL. */
function forwardTargetUrl(target: string, record: CapturedRequest): string {
  const base = new URL(target);
  const rel = record.url || record.path || "/";
  const joined = base.pathname.replace(/\/$/, "") + (rel.startsWith("/") ? rel : "/" + rel);
  const [pathname, search = ""] = joined.split("?");
  const url = new URL(base.origin);
  url.pathname = pathname || "/";
  if (search) url.search = search;
  return url.toString();
}

/** Forward a captured request to `target` and return status/headers/body. */
async function forwardRequest(
  target: string,
  record: CapturedRequest,
  rawBody: Buffer,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const url = forwardTargetUrl(target, record);
  const headers: Record<string, string> = {};
  const strip = new Set(["host", "content-length", "connection", "transfer-encoding", "keep-alive", "accept-encoding"]);
  for (const [k, v] of Object.entries(record.headers)) {
    if (v === undefined || strip.has(k.toLowerCase())) continue;
    headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  const m = record.method.toUpperCase();
  const init: RequestInit = { method: m, headers };
  if (m !== "GET" && m !== "HEAD" && rawBody.length) init.body = new Uint8Array(rawBody);
  const res = await fetch(url, init);
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((val, key) => {
    if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") return;
    respHeaders[key] = val;
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: respHeaders, body: buf };
}

/** Forward to every target (with retry/backoff), returning per-target outcomes plus the first successful relay. */
async function forwardAll(
  targets: string[],
  record: CapturedRequest,
  rawBody: Buffer,
  retry: number,
): Promise<{ results: ForwardResult[]; relay?: { status: number; headers: Record<string, string>; body: Buffer } }> {
  const results: ForwardResult[] = [];
  let relay: { status: number; headers: Record<string, string>; body: Buffer } | undefined;
  for (const target of targets) {
    let attempts = 0;
    let ok = false;
    let status: number | undefined;
    let error: string | undefined;
    let response: { status: number; headers: Record<string, string>; body: Buffer } | undefined;
    for (let attempt = 0; attempt <= retry; attempt++) {
      attempts++;
      try {
        response = await forwardRequest(target, record, rawBody);
        status = response.status;
        ok = true;
        break;
      } catch (err) {
        error = (err as Error).message;
        if (attempt < retry) await sleep(250 * Math.pow(2, attempt));
      }
    }
    const result: ForwardResult = { target, ok, attempts };
    if (status !== undefined) result.status = status;
    if (error && !ok) result.error = error;
    results.push(result);
    if (ok && response && !relay) relay = response;
  }
  return relay ? { results, relay } : { results };
}

/**
 * Create (but do not start) an `http.Server` wired with the capture/verify/
 * mock/forward pipeline. Call `receiver.server.listen(port)` to start it.
 */
export function createReceiver(opts: ReceiverOptions = {}): Receiver {
  const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const targets = normalizeForward(opts.forward);
  const forwardRetry = opts.forwardRetry && opts.forwardRetry > 0 ? opts.forwardRetry : 0;
  const sseClients = new Set<ServerResponse>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res);
  });

  function broadcast(ev: UiEvent): void {
    if (sseClients.size === 0) return;
    const frame = sseFrame("capture", ev);
    for (const client of sseClients) {
      try { client.write(frame); } catch { /* drop broken client */ }
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reqPath = (req.url ?? "/").split("?")[0];

    // Reserved inspector routes (only when the UI is enabled) — served before
    // the path filter so the dashboard works even with --path set.
    if (opts.ui) {
      if (req.method === "GET" && reqPath === UI_EVENTS) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });
        res.write(sseFrame("hello", { at: new Date().toISOString() }));
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }
      if (req.method === "GET" && (reqPath === UI_PAGE || reqPath === `${UI_PAGE}/`)) {
        const html = inspectorHtml({
          port: portOf(res),
          ...(opts.path ? { path: opts.path } : {}),
          ...(opts.verify ? { verify: opts.verify } : {}),
        });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }

    // Path filter.
    if (opts.path && reqPath !== opts.path) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found", expected: opts.path }));
      return;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readBody(req, maxBody);
    } catch (err) {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
      return;
    }

    const record = toRecord(req, rawBody);

    let verifyResult: VerifyResult | undefined;
    if (opts.verify && (opts.secret || opts.verify === "auto")) {
      verifyResult = verifySignature(opts.verify, {
        rawBody,
        headers: record.headers,
        secret: opts.secret ?? "",
        ...(opts.signatureHeader ? { header: opts.signatureHeader } : {}),
      });
    }

    try { opts.onRequest?.(record, verifyResult); } catch { /* never let a callback break the response */ }

    // Mock rules take priority: they let the receiver stand in for a real endpoint.
    const rule = opts.rules && opts.rules.length ? findRule(opts.rules, record) : undefined;
    if (rule) {
      const resp = resolveResponse(rule);
      broadcast({ record, ...(verifyResult ? { verify: verifyResult } : {}), response: { status: resp.status } });
      if (resp.delay) await sleep(resp.delay);
      const headers = { "content-type": "application/json", ...resp.headers };
      res.writeHead(resp.status, headers);
      res.end(resp.body);
      return;
    }

    // Forward mode: deliver to each target, relay the first successful response.
    if (targets.length > 0) {
      const { results, relay } = await forwardAll(targets, record, rawBody, forwardRetry);
      try { opts.onForward?.(record, results); } catch { /* ignore */ }
      const status = relay ? relay.status : 502;
      broadcast({ record, ...(verifyResult ? { verify: verifyResult } : {}), response: { status } });
      if (relay) {
        res.writeHead(relay.status, relay.headers);
        res.end(relay.body);
      } else {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "all forward targets failed", targets: results }));
      }
      return;
    }

    // Default canned response.
    const status = opts.status ?? 200;
    const body = opts.body ?? JSON.stringify({ ok: true });
    broadcast({ record, ...(verifyResult ? { verify: verifyResult } : {}), response: { status } });
    if (opts.delay && opts.delay > 0) await sleep(opts.delay);
    res.writeHead(status, { "content-type": opts.contentType ?? "application/json" });
    res.end(body);
  }

  function portOf(_res: ServerResponse): number {
    const addr = server.address();
    return typeof addr === "object" && addr ? addr.port : 4000;
  }

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of sseClients) { try { client.end(); } catch { /* ignore */ } }
        sseClients.clear();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
