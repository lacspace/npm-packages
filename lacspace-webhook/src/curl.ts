/**
 * Export a captured request as a ready-to-run `curl` command, and import a
 * `curl` command string back into a {@link CapturedRequest}. Round-trips the
 * method, URL/path, headers and body.
 */
import { randomBytes } from "node:crypto";
import type { CapturedRequest } from "./capture.js";
import { parseQuery } from "./capture.js";

/** Options for {@link toCurl}. */
export interface ToCurlOptions {
  /** Base URL to build an absolute target (default `http://localhost:4000`). */
  base?: string;
  /** Emit one flag per line with `\` continuations (default true). */
  multiline?: boolean;
  /** Skip these headers (case-insensitive). Transport headers are always dropped. */
  skipHeaders?: string[];
}

/** Headers that never belong in a reproduced request. */
const TRANSPORT = new Set([
  "host", "content-length", "connection", "transfer-encoding",
  "keep-alive", "accept-encoding", "expect",
]);

/** Single-quote a value for POSIX shells (safe for arbitrary bytes). */
function shq(s: string): string {
  // Each embedded ' becomes '\'' (close-quote, escaped quote, re-open-quote).
  return "'" + s.split("'").join("'\\''") + "'";
}

function absoluteUrl(record: CapturedRequest, base: string): string {
  const rel = record.url || record.path || "/";
  try {
    const b = new URL(base);
    const joined = b.pathname.replace(/\/$/, "") + (rel.startsWith("/") ? rel : "/" + rel);
    const [pathname, search = ""] = joined.split("?");
    const u = new URL(b.origin);
    u.pathname = pathname || "/";
    if (search) u.search = search;
    return u.toString();
  } catch {
    return rel;
  }
}

/**
 * Build a `curl` command that reproduces a captured request. GET requests omit
 * `-X`; a non-empty body is emitted with `--data-raw`.
 */
export function toCurl(record: CapturedRequest, opts: ToCurlOptions = {}): string {
  const base = opts.base ?? "http://localhost:4000";
  const skip = new Set([...(opts.skipHeaders ?? [])].map((h) => h.toLowerCase()));
  const parts: string[] = ["curl"];
  const method = record.method.toUpperCase();

  if (method !== "GET") parts.push("-X", method);
  parts.push(shq(absoluteUrl(record, base)));

  for (const [k, v] of Object.entries(record.headers)) {
    if (v === undefined) continue;
    const lk = k.toLowerCase();
    if (TRANSPORT.has(lk) || skip.has(lk)) continue;
    const value = Array.isArray(v) ? v.join(", ") : v;
    parts.push("-H", shq(`${k}: ${value}`));
  }

  if (record.body && method !== "GET" && method !== "HEAD") {
    parts.push("--data-raw", shq(record.body));
  }

  const multiline = opts.multiline ?? true;
  if (!multiline) return parts.join(" ");

  // Group as: `curl -X POST 'url'` then one `flag value` pair per line.
  const out: string[] = [];
  let i = 0;
  // curl
  let head = parts[i++]!;
  // optional -X METHOD
  if (parts[i] === "-X") { head += ` ${parts[i++]} ${parts[i++]}`; }
  // url
  head += ` ${parts[i++]}`;
  out.push(head);
  while (i < parts.length) {
    const flag = parts[i++]!;
    const val = parts[i++] ?? "";
    out.push(`  ${flag} ${val}`);
  }
  return out.join(" \\\n");
}

/** Split a shell-ish command line into tokens, honoring single/double quotes and `\` continuations. */
export function tokenizeCurl(cmd: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let has = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      if (quote === '"' && ch === "\\" && i + 1 < cmd.length) {
        const n = cmd[i + 1]!;
        // In double quotes, a backslash escapes " \ $ and the backtick.
        if (n === '"' || n === "\\" || n === "$" || n === String.fromCharCode(96)) { cur += n; i++; continue; }
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (ch === "\\") {
      const n = cmd[i + 1];
      if (n === "\n") { i++; continue; }         // line continuation
      if (n !== undefined) { cur += n; has = true; i++; continue; }
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (has) { tokens.push(cur); cur = ""; has = false; }
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

function shortId(): string {
  return randomBytes(6).toString("hex");
}

/**
 * Parse a `curl` command string into a {@link CapturedRequest}. Understands
 * `-X/--request`, `-H/--header`, the `-d`/`--data` family, `--json`,
 * `-b/--cookie`, `-A/--user-agent`, `-e/--referer`, `--url`, and a positional
 * URL. Method defaults to POST when a body is present, else GET.
 */
export function fromCurl(cmd: string): CapturedRequest {
  const tokens = tokenizeCurl(cmd);
  let method: string | undefined;
  let url: string | undefined;
  const headers: Record<string, string | string[] | undefined> = {};
  const dataParts: string[] = [];
  let getStyle = false;

  const addHeader = (raw: string): void => {
    const idx = raw.indexOf(":");
    if (idx === -1) return;
    const name = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (!name) return;
    const existing = headers[name.toLowerCase()] ?? headers[name];
    if (existing === undefined) headers[name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else {
      // find the actual stored key (case may differ) and turn it into an array
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
      headers[key] = [String(existing), value];
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "curl") continue;
    if (t === "-X" || t === "--request") { method = tokens[++i]; continue; }
    if (t === "-H" || t === "--header") { const v = tokens[++i]; if (v !== undefined) addHeader(v); continue; }
    if (t === "--url") { url = tokens[++i]; continue; }
    if (t === "-A" || t === "--user-agent") { const v = tokens[++i]; if (v !== undefined) headers["User-Agent"] = v; continue; }
    if (t === "-e" || t === "--referer") { const v = tokens[++i]; if (v !== undefined) headers["Referer"] = v; continue; }
    if (t === "-b" || t === "--cookie") { const v = tokens[++i]; if (v !== undefined) headers["Cookie"] = v; continue; }
    if (t === "-G" || t === "--get") { getStyle = true; continue; }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-ascii" || t === "--data-binary" || t === "--data-urlencode") {
      const v = tokens[++i]; if (v !== undefined) dataParts.push(v); continue;
    }
    if (t === "--json") {
      const v = tokens[++i];
      if (v !== undefined) dataParts.push(v);
      if (!hasHeaderCI(headers, "content-type")) headers["Content-Type"] = "application/json";
      if (!hasHeaderCI(headers, "accept")) headers["Accept"] = "application/json";
      continue;
    }
    // Flags that take a value we don't model — skip the value.
    if (t === "-u" || t === "--user" || t === "-o" || t === "--output" || t === "-w" || t === "--write-out" || t === "-m" || t === "--max-time" || t === "--connect-timeout") { i++; continue; }
    // Value-less flags we ignore.
    if (t.startsWith("-")) continue;
    // First bare token is the URL.
    if (url === undefined) url = t;
  }

  if (!url) throw new Error("no URL found in curl command");
  const body = dataParts.join("&");
  if (!method) method = body && !getStyle ? "POST" : "GET";

  let path = "/";
  let fullTarget = url;
  let query: Record<string, string | string[]> = {};
  try {
    const u = new URL(url);
    path = u.pathname || "/";
    query = parseQuery(u.search.replace(/^\?/, ""));
    fullTarget = u.pathname + u.search;
  } catch {
    // Relative URL: split path/query manually.
    const q = url.indexOf("?");
    path = q === -1 ? url : url.slice(0, q);
    if (q !== -1) query = parseQuery(url.slice(q + 1));
    fullTarget = url;
  }

  const contentType = headerValueCI(headers, "content-type");
  const record: CapturedRequest = {
    id: shortId(),
    at: new Date().toISOString(),
    method: method.toUpperCase(),
    path,
    url: fullTarget,
    query,
    headers,
    body,
    bytes: Buffer.byteLength(body, "utf8"),
  };
  if (contentType !== undefined) record.contentType = contentType;
  return record;
}

function hasHeaderCI(headers: Record<string, unknown>, name: string): boolean {
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}
function headerValueCI(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}
