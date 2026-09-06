/**
 * Replay captured requests against a target URL using the global `fetch`.
 * Supports filtering which records to send, transforming them before sending
 * (header overrides, body replace, find/replace rewrites), retries with
 * backoff, and CI-style assertions (`expectStatus` / `expectContains`).
 */
import type { CapturedRequest } from "./capture.js";

/** A single find→replace rewrite applied to the body. */
export interface Rewrite {
  find: string;
  replace: string;
  /** Treat `find` as a regular expression (default false = literal). */
  regex?: boolean;
}

/** A parsed record filter (all fields AND-combined). */
export interface ReplayFilter {
  method?: string;
  path?: string;
  pathPrefix?: string;
  bodyContains?: string;
}

/** Options for {@link replayRequests}. */
export interface ReplayOptions {
  /** The base target URL. The captured path is appended to it. */
  to: string;
  /** Milliseconds to wait between requests (default 0). */
  delay?: number;
  /** Only replay records matching this filter. */
  filter?: ReplayFilter;
  /** Header overrides applied to every request (added or replaced). */
  headers?: Record<string, string>;
  /** Replace the body of every request with this exact string. */
  setBody?: string;
  /** Find/replace rewrites applied to the body, in order. */
  rewrite?: Rewrite[];
  /** Retry a failed send this many times with exponential backoff (default 0). */
  retry?: number;
  /** Base backoff in ms for retries (default 250; doubles each attempt). */
  backoff?: number;
  /** Assert the response status equals this. */
  expectStatus?: number;
  /** Assert the response body contains this substring (reads the body). */
  expectContains?: string;
}

/** One replayed response. */
export interface ReplayResult {
  status: number;
  /** Present only when assertions ran: whether this request passed. */
  ok?: boolean;
  /** Present only when `expectContains` ran: the response body text. */
  body?: string;
  /** Number of send attempts made (present only when `retry` > 0). */
  attempts?: number;
  /** Present when an assertion failed: a short reason. */
  reason?: string;
}

/** Headers we must not copy from the capture — they'd fight `fetch`/the transport. */
const STRIPPED = new Set([
  "host", "content-length", "connection", "transfer-encoding",
  "keep-alive", "accept-encoding", "expect",
]);

/** Build the absolute target URL by joining `to` with the captured path. */
export function resolveTarget(to: string, record: CapturedRequest): string {
  const base = new URL(to);
  const rel = record.url || record.path || "/";
  // Join: if `to` already has a path, the captured path is appended to it.
  const joined = base.pathname.replace(/\/$/, "") + (rel.startsWith("/") ? rel : "/" + rel);
  const url = new URL(base.origin);
  const [pathname, search = ""] = joined.split("?");
  url.pathname = pathname || "/";
  if (search) url.search = search;
  return url.toString();
}

/** Turn a captured header bag into a plain, transport-safe header record. */
export function buildHeaders(record: CapturedRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record.headers)) {
    if (v === undefined) continue;
    if (STRIPPED.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

/** Parse a `--filter "method=POST,path=/x"` string into a {@link ReplayFilter}. */
export function parseFilter(spec: string): ReplayFilter {
  const f: ReplayFilter = {};
  for (const pair of spec.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim().toLowerCase();
    const v = pair.slice(idx + 1).trim();
    if (k === "method") f.method = v;
    else if (k === "path") f.path = v;
    else if (k === "pathprefix" || k === "path-prefix") f.pathPrefix = v;
    else if (k === "body" || k === "bodycontains" || k === "body-contains") f.bodyContains = v;
  }
  return f;
}

function pathMatches(pattern: string, value: string): boolean {
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }
  return pattern === value;
}

/** Does a record pass a {@link ReplayFilter}? A filter with no fields matches everything. */
export function matchFilter(record: CapturedRequest, filter?: ReplayFilter): boolean {
  if (!filter) return true;
  if (filter.method && filter.method.toUpperCase() !== record.method.toUpperCase()) return false;
  if (filter.path && !pathMatches(filter.path, record.path)) return false;
  if (filter.pathPrefix && !record.path.startsWith(filter.pathPrefix)) return false;
  if (filter.bodyContains && !record.body.includes(filter.bodyContains)) return false;
  return true;
}

/** Parse `--rewrite 'find=>replace'` (or `find::replace`) into a {@link Rewrite}. */
export function parseRewrite(spec: string): Rewrite {
  const sep = spec.includes("=>") ? "=>" : spec.includes("::") ? "::" : null;
  if (!sep) return { find: spec, replace: "" };
  const idx = spec.indexOf(sep);
  return { find: spec.slice(0, idx), replace: spec.slice(idx + sep.length) };
}

/**
 * Return a copy of `record` with header overrides, a replaced body (`setBody`)
 * and/or find/replace rewrites applied. Pure — does not mutate the input.
 */
export function applyReplayTransform(
  record: CapturedRequest,
  opts: Pick<ReplayOptions, "headers" | "setBody" | "rewrite">,
): CapturedRequest {
  let body = record.body;
  if (opts.setBody !== undefined) body = opts.setBody;
  if (opts.rewrite) {
    for (const rw of opts.rewrite) {
      if (rw.regex) {
        try {
          body = body.replace(new RegExp(rw.find, "g"), rw.replace);
        } catch {
          /* leave body unchanged on a bad pattern */
        }
      } else {
        body = body.split(rw.find).join(rw.replace);
      }
    }
  }
  const headers = { ...record.headers };
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      // Replace case-insensitively: drop any existing same-named header first.
      for (const existing of Object.keys(headers)) {
        if (existing.toLowerCase() === k.toLowerCase()) delete headers[existing];
      }
      headers[k] = v;
    }
  }
  const next: CapturedRequest = {
    ...record,
    headers,
    body,
    bytes: Buffer.byteLength(body, "utf8"),
  };
  return next;
}

/** Whether a method is allowed to carry a body. */
function methodHasBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD";
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Re-send each captured request to `opts.to`, in order, honoring `opts.delay`.
 * Returns one result per record.
 *
 * Backward-compatible: with no filter/transform/retry/assert options, each
 * result is exactly `{ status }` (as in 0.1.0).
 */
export async function replayRequests(
  records: CapturedRequest[],
  opts: ReplayOptions,
): Promise<ReplayResult[]> {
  const selected = opts.filter ? records.filter((r) => matchFilter(r, opts.filter)) : records;
  const transform = opts.setBody !== undefined || opts.rewrite || opts.headers;
  const doAssert = opts.expectStatus !== undefined || opts.expectContains !== undefined;
  const retries = opts.retry && opts.retry > 0 ? opts.retry : 0;
  const backoff = opts.backoff ?? 250;

  const results: ReplayResult[] = [];
  for (let i = 0; i < selected.length; i++) {
    let record = selected[i]!;
    if (transform) {
      record = applyReplayTransform(record, {
        ...(opts.headers ? { headers: opts.headers } : {}),
        ...(opts.setBody !== undefined ? { setBody: opts.setBody } : {}),
        ...(opts.rewrite ? { rewrite: opts.rewrite } : {}),
      });
    }
    const target = resolveTarget(opts.to, record);
    const init: RequestInit = {
      method: record.method.toUpperCase(),
      headers: buildHeaders(record),
    };
    if (methodHasBody(record.method) && record.body) init.body = record.body;

    let attempts = 0;
    let status = 0;
    let bodyText: string | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      attempts++;
      try {
        const res = await fetch(target, init);
        status = res.status;
        if (doAssert && opts.expectContains !== undefined && typeof res.text === "function") {
          bodyText = await res.text();
        }
        // Retry server errors when retries are allowed.
        if (retries > 0 && attempt < retries && status >= 500) {
          await sleep(backoff * Math.pow(2, attempt));
          continue;
        }
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await sleep(backoff * Math.pow(2, attempt));
          continue;
        }
      }
    }

    const result: ReplayResult = { status };
    if (retries > 0) result.attempts = attempts;
    if (doAssert) {
      let ok = true;
      let reason: string | undefined;
      if (lastErr) { ok = false; reason = `request failed: ${(lastErr as Error).message}`; }
      if (ok && opts.expectStatus !== undefined && status !== opts.expectStatus) {
        ok = false; reason = `expected status ${opts.expectStatus}, got ${status}`;
      }
      if (ok && opts.expectContains !== undefined && !(bodyText ?? "").includes(opts.expectContains)) {
        ok = false; reason = `body did not contain ${JSON.stringify(opts.expectContains)}`;
      }
      result.ok = ok;
      if (bodyText !== undefined) result.body = bodyText;
      if (reason) result.reason = reason;
    }
    results.push(result);

    if (opts.delay && i < selected.length - 1) {
      await sleep(opts.delay);
    }
  }
  return results;
}
