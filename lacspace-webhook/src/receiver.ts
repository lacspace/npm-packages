/**
 * The local webhook receiver: an `http.Server` that accepts any method/path,
 * captures each request, optionally verifies a signature, optionally forwards
 * to a local URL, and returns a response.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { CapturedRequest } from "./capture.js";
import { parseQuery } from "./capture.js";
import { verifySignature } from "./verify.js";
import type { SignatureScheme, VerifyResult } from "./verify.js";

/** Options controlling a receiver. */
export interface ReceiverOptions {
  /** Only accept this exact path (default: accept any path). */
  path?: string;
  /** Forward each request to this URL and relay its response to the caller. */
  forward?: string;
  /** Response status when not forwarding (default 200). */
  status?: number;
  /** Response body when not forwarding (default `{"ok":true}`). */
  body?: string;
  /** Response `content-type` when not forwarding (default `application/json`). */
  contentType?: string;
  /** Secret used to verify signatures (with `verify`). */
  secret?: string;
  /** Signature scheme to verify. Requires `secret`. */
  verify?: SignatureScheme;
  /** For the generic `hmac-sha256` scheme: the signature header name. */
  signatureHeader?: string;
  /** Maximum body bytes to buffer before rejecting (default 5 MB). */
  maxBodyBytes?: number;
  /** Called for every captured request (after verification, before responding). */
  onRequest?: (record: CapturedRequest, verify?: VerifyResult) => void;
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

/** Forward a captured request to `target` and return status/headers/body. */
async function forwardRequest(
  target: string,
  record: CapturedRequest,
  rawBody: Buffer,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const base = new URL(target);
  const rel = record.url || record.path || "/";
  const joined = base.pathname.replace(/\/$/, "") + (rel.startsWith("/") ? rel : "/" + rel);
  const [pathname, search = ""] = joined.split("?");
  const url = new URL(base.origin);
  url.pathname = pathname || "/";
  if (search) url.search = search;

  const headers: Record<string, string> = {};
  const strip = new Set(["host", "content-length", "connection", "transfer-encoding", "keep-alive", "accept-encoding"]);
  for (const [k, v] of Object.entries(record.headers)) {
    if (v === undefined || strip.has(k.toLowerCase())) continue;
    headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  const m = record.method.toUpperCase();
  const init: RequestInit = { method: m, headers };
  if (m !== "GET" && m !== "HEAD" && rawBody.length) init.body = new Uint8Array(rawBody);
  const res = await fetch(url.toString(), init);
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((val, key) => {
    if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") return;
    respHeaders[key] = val;
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: respHeaders, body: buf };
}

/**
 * Create (but do not start) an `http.Server` wired with the capture/verify/
 * forward pipeline. Call `receiver.server.listen(port)` to start it.
 */
export function createReceiver(opts: ReceiverOptions = {}): Receiver {
  const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Path filter.
    if (opts.path) {
      const reqPath = (req.url ?? "/").split("?")[0];
      if (reqPath !== opts.path) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found", expected: opts.path }));
        return;
      }
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
    if (opts.verify && opts.secret) {
      verifyResult = verifySignature(opts.verify, {
        rawBody,
        headers: record.headers,
        secret: opts.secret,
        ...(opts.signatureHeader ? { header: opts.signatureHeader } : {}),
      });
    }

    try {
      opts.onRequest?.(record, verifyResult);
    } catch {
      /* never let a callback error break the response */
    }

    // Forward mode: relay the upstream response back to the caller.
    if (opts.forward) {
      try {
        const fwd = await forwardRequest(opts.forward, record, rawBody);
        res.writeHead(fwd.status, fwd.headers);
        res.end(fwd.body);
      } catch (err) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "forward failed", detail: (err as Error).message }));
      }
      return;
    }

    // Default canned response.
    const status = opts.status ?? 200;
    const body = opts.body ?? JSON.stringify({ ok: true });
    res.writeHead(status, { "content-type": opts.contentType ?? "application/json" });
    res.end(body);
  }

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
