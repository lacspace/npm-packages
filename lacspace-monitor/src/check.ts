/**
 * The monitor runtime — fetch a watch's current value (reusing the
 * lacspace-scraper engine for content, and native fetch/TLS for status, headers,
 * timing, availability and certificate expiry), snapshot it, diff against the
 * last run, evaluate any `--when` condition, persist state, and (optionally) fire
 * notifiers. Never throws into a run.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { connect as tlsConnect } from "node:tls";
import { fetchPage, parseHTML, queryAll, queryOne, innerText } from "lacspace-scraper";
import {
  diffSnapshots, evalWhen, feedItemIds, getByPath, inferType, retainHistory,
  snapshotItems, snapshotValue, toValueString, watchId,
} from "./core.js";
import type { CheckResult, MonitorState, Snapshot, Watch, WatchType } from "./types.js";

export interface CheckOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Types that hit the wire for response metadata rather than page content. */
const META_TYPES = new Set<WatchType>(["status", "header", "response-time", "availability"]);
/** Types whose value drifts every check, so they only alert with a `--when`. */
const DRIFT_TYPES = new Set<WatchType>(["response-time", "ssl-expiry"]);

interface Meta { status: number; ok: boolean; headers: Record<string, string>; responseTimeMs: number }

/** Fetch response metadata (status, headers, timing) via native fetch. */
async function fetchMeta(url: string, opts: CheckOptions): Promise<Meta> {
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  const start = performance.now();
  try {
    const res = await fetch(url, { headers: opts.headers, redirect: "follow", signal: controller.signal });
    await res.text().catch(() => "");
    const responseTimeMs = Math.round(performance.now() - start);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { status: res.status, ok: res.ok, headers, responseTimeMs };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Read a site's TLS certificate `notAfter` date. */
function fetchCertNotAfter(url: string, timeoutMs?: number): Promise<Date> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(url); } catch { return reject(new Error(`Invalid URL: ${url}`)); }
    const host = u.hostname;
    const port = u.port ? Number(u.port) : 443;
    const socket = tlsConnect({ host, port, servername: host, timeout: timeoutMs ?? 15000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return reject(new Error("No TLS certificate returned."));
      resolve(new Date(cert.valid_to));
    });
    socket.on("error", reject);
    socket.on("timeout", () => { socket.destroy(); reject(new Error("TLS handshake timed out.")); });
  });
}

/** Compute a watch's current snapshot value by type. */
async function captureSnapshot(watch: Watch, type: WatchType, opts: CheckOptions): Promise<Snapshot> {
  if (META_TYPES.has(type)) {
    const meta = await fetchMeta(watch.url, opts);
    if (type === "status") return snapshotValue(String(meta.status));
    if (type === "response-time") return snapshotValue(String(meta.responseTimeMs));
    if (type === "availability") return snapshotValue(meta.status > 0 && meta.status < 400 ? "up" : "down");
    // header
    const name = (watch.header ?? "").toLowerCase();
    return snapshotValue(meta.headers[name] ?? "");
  }
  if (type === "ssl-expiry") {
    const notAfter = await fetchCertNotAfter(watch.url, opts.timeoutMs);
    const days = Math.floor((notAfter.getTime() - Date.now()) / 86400000);
    return snapshotValue(String(days));
  }

  // content-bearing types reuse the scraper fetch
  const fetchOpts: { headers?: Record<string, string>; timeoutMs?: number; retries: number } = { retries: 1 };
  const headers = { ...opts.headers, ...watch.headers };
  if (Object.keys(headers).length) fetchOpts.headers = headers;
  if (opts.timeoutMs !== undefined) fetchOpts.timeoutMs = opts.timeoutMs;
  const res = await fetchPage(watch.url, fetchOpts);

  if (type === "feed") return snapshotItems(feedItemIds(res.html));
  if (type === "text") return snapshotValue(res.html.trim());
  if (type === "json") {
    let parsed: unknown;
    try { parsed = JSON.parse(res.html); } catch { throw new Error("Response is not valid JSON."); }
    return snapshotValue(toValueString(getByPath(parsed, watch.path ?? "")));
  }
  if (type === "content") {
    const hit =
      watch.contains != null ? res.html.includes(watch.contains)
      : watch.absent != null ? !res.html.includes(watch.absent)
      : watch.match != null ? new RegExp(watch.match).test(res.html)
      : false;
    return snapshotValue(hit ? "yes" : "no");
  }
  if (type === "selector") {
    const root = parseHTML(res.html);
    const el = queryAll(root, watch.selector ?? "*")[0];
    if (!el) throw new Error(`Selector "${watch.selector}" matched nothing.`);
    const attr = watch.attr?.replace(/^@/, "");
    return snapshotValue(attr ? (el.attrs[attr] ?? "") : innerText(el));
  }
  // page
  const root = parseHTML(res.html);
  const body = queryOne(root, "body") ?? root;
  return snapshotValue(innerText(body));
}

/** Check one watch against its previous snapshot. Returns the result + new snapshot. */
export async function checkWatch(
  watch: Watch,
  prev: Snapshot | undefined,
  opts: CheckOptions = {},
): Promise<{ result: CheckResult; snapshot?: Snapshot }> {
  const type = inferType(watch);
  const id = watchId(watch);
  const label = watch.label ?? watch.url;
  const at = new Date().toISOString();
  const base: CheckResult = { id, label, url: watch.url, type, changed: false, alerted: false, baseline: !prev, at };
  if (watch.when) base.condition = watch.when;

  try {
    const captured = await captureSnapshot(watch, type, opts);
    const next = retainHistory(prev, captured);

    const diff = diffSnapshots(prev, next, type);
    const drift = DRIFT_TYPES.has(type);
    const alerted = watch.when
      ? evalWhen(watch.when, { before: diff.before, after: diff.after ?? next.value, changed: diff.changed, baseline: !prev })
      : drift ? false : diff.changed;

    const result: CheckResult = { ...base, changed: diff.changed, alerted };
    if (diff.before !== undefined) result.before = diff.before;
    if (diff.after !== undefined) result.after = diff.after;
    // For value conditions on an unchanged watch, still surface the current value.
    if (result.after === undefined && next.value !== undefined && (alerted || watch.when)) result.after = next.value;
    if (diff.added && diff.added.length) result.added = diff.added;
    if (diff.removed && diff.removed.length) result.removed = diff.removed;
    return { result, snapshot: next };
  } catch (err) {
    return { result: { ...base, error: err instanceof Error ? err.message : String(err) } };
  }
}

/** Load monitor state from a JSON file (returns `{}` when absent/broken). */
export function loadState(file: string): MonitorState {
  try {
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf8")) as MonitorState;
  } catch {
    return {};
  }
}

/** Persist monitor state to a JSON file. */
export function saveState(file: string, state: MonitorState): void {
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

/** POST changed results to a webhook. Never throws. Returns success. */
export async function sendWebhook(url: string, results: CheckResult[]): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "lacspace-monitor", at: new Date().toISOString(), changes: results }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Run every watch, diffing against `state` and returning the results plus the
 * updated state. Runs a few in parallel. Pure w.r.t. the passed state (returns a
 * new object; does not write to disk).
 */
export async function runChecks(
  watches: Watch[],
  state: MonitorState,
  opts: CheckOptions & { concurrency?: number; onResult?: (r: CheckResult) => void } = {},
): Promise<{ results: CheckResult[]; state: MonitorState }> {
  const results: CheckResult[] = new Array(watches.length);
  const nextState: MonitorState = { ...state };
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, watches.length || 1)) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= watches.length) return;
      const w = watches[idx]!;
      const id = watchId(w);
      const { result, snapshot } = await checkWatch(w, state[id], opts);
      results[idx] = result;
      if (snapshot) nextState[id] = snapshot;
      opts.onResult?.(result);
    }
  });
  await Promise.all(workers);
  return { results, state: nextState };
}
