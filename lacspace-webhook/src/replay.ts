/**
 * Replay captured requests against a target URL using the global `fetch`.
 */
import type { CapturedRequest } from "./capture.js";

/** Options for {@link replayRequests}. */
export interface ReplayOptions {
  /** The base target URL. The captured path is appended to it. */
  to: string;
  /** Milliseconds to wait between requests (default 0). */
  delay?: number;
}

/** One replayed response. */
export interface ReplayResult {
  status: number;
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

/** Whether a method is allowed to carry a body. */
function methodHasBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD";
}

/**
 * Re-send each captured request to `opts.to`, in order, honoring `opts.delay`.
 * Returns one `{ status }` per record. Uses the global `fetch` (Node ≥ 20).
 */
export async function replayRequests(
  records: CapturedRequest[],
  opts: ReplayOptions,
): Promise<ReplayResult[]> {
  const results: ReplayResult[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const target = resolveTarget(opts.to, record);
    const init: RequestInit = {
      method: record.method.toUpperCase(),
      headers: buildHeaders(record),
    };
    if (methodHasBody(record.method) && record.body) init.body = record.body;
    const res = await fetch(target, init);
    results.push({ status: res.status });
    if (opts.delay && i < records.length - 1) {
      await new Promise((r) => setTimeout(r, opts.delay));
    }
  }
  return results;
}
