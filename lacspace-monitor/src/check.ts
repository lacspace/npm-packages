/**
 * The monitor runtime — fetch a watch's current value (reusing the
 * lacspace-scraper engine), snapshot it, diff against the last run, persist
 * state, and (optionally) fire a webhook. Never throws into a run.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchPage, parseHTML, queryAll, queryOne, innerText } from "lacspace-scraper";
import {
  diffSnapshots, feedItemIds, getByPath, inferType, snapshotItems, snapshotValue, toValueString, watchId,
} from "./core.js";
import type { CheckResult, MonitorState, Snapshot, Watch } from "./types.js";

export interface CheckOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
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
  const base: CheckResult = { id, label, url: watch.url, type, changed: false, baseline: !prev, at };

  try {
    const fetchOpts: { headers?: Record<string, string>; timeoutMs?: number; retries: number } = { retries: 1 };
    const headers = { ...opts.headers, ...watch.headers };
    if (Object.keys(headers).length) fetchOpts.headers = headers;
    if (opts.timeoutMs !== undefined) fetchOpts.timeoutMs = opts.timeoutMs;
    const res = await fetchPage(watch.url, fetchOpts);

    let next: Snapshot;
    if (type === "feed") {
      next = snapshotItems(feedItemIds(res.html));
    } else if (type === "text") {
      next = snapshotValue(res.html.trim());
    } else if (type === "json") {
      let parsed: unknown;
      try { parsed = JSON.parse(res.html); } catch { throw new Error("Response is not valid JSON."); }
      next = snapshotValue(toValueString(getByPath(parsed, watch.path ?? "")));
    } else if (type === "selector") {
      const root = parseHTML(res.html);
      const el = queryAll(root, watch.selector ?? "*")[0];
      if (!el) throw new Error(`Selector "${watch.selector}" matched nothing.`);
      const attr = watch.attr?.replace(/^@/, "");
      next = snapshotValue(attr ? (el.attrs[attr] ?? "") : innerText(el));
    } else {
      // page
      const root = parseHTML(res.html);
      const body = queryOne(root, "body") ?? root;
      next = snapshotValue(innerText(body));
    }

    const diff = diffSnapshots(prev, next, type);
    const result: CheckResult = { ...base, changed: diff.changed };
    if (diff.before !== undefined) result.before = diff.before;
    if (diff.after !== undefined) result.after = diff.after;
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
