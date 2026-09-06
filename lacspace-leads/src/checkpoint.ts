/**
 * Resume / checkpoint support for long city sweeps.
 *
 * A batch (or config) run over dozens of neighbourhoods can take a while and may
 * be interrupted — a CAPTCHA, a dropped connection, a Ctrl-C. With `--resume`
 * the CLI persists a small checkpoint file after every completed sub-search:
 * which queries are done and the leads gathered so far. On restart it skips the
 * already-collected queries and continues where it left off.
 *
 * The identity/skip/merge logic lives here as pure functions (so it's unit
 * tested without a browser); the file read/write helpers are thin wrappers.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import type { BatchQuery } from "./batch.js";
import type { Lead } from "./types.js";

/** The on-disk resume state. */
export interface Checkpoint {
  version: 1;
  createdAt: string;
  updatedAt: string;
  /** Canonical {@link queryKey}s of the sub-searches already completed. */
  done: string[];
  /** Leads collected so far, across every completed sub-search. */
  leads: Lead[];
}

/** A fresh, empty checkpoint. Pure. */
export function emptyCheckpoint(): Checkpoint {
  const now = new Date().toISOString();
  return { version: 1, createdAt: now, updatedAt: now, done: [], leads: [] };
}

/**
 * A stable, canonical key for a batch sub-query — so the same
 * `{type, city, area}` (or verbatim `query`) always maps to one slot,
 * regardless of casing or surrounding whitespace. Pure.
 */
export function queryKey(q: BatchQuery): string {
  if (q.query && q.query.trim()) return `q:${q.query.trim().toLowerCase()}`;
  return [`t:${(q.type ?? "").trim()}`, `c:${(q.city ?? "").trim()}`, `a:${(q.area ?? "").trim()}`]
    .map((s) => s.toLowerCase())
    .join("|");
}

/** True when this query has already been collected in the checkpoint. Pure. */
export function isDone(cp: Checkpoint | undefined, q: BatchQuery): boolean {
  return !!cp && cp.done.includes(queryKey(q));
}

/** The queries still to run — everything not already marked done. Pure. */
export function pendingQueries(all: BatchQuery[], cp: Checkpoint | undefined): BatchQuery[] {
  if (!cp || cp.done.length === 0) return [...all];
  const done = new Set(cp.done);
  return all.filter((q) => !done.has(queryKey(q)));
}

/**
 * Record a completed sub-search's leads into the checkpoint (mutates and
 * returns it). Re-recording the same query key is a no-op for `done` but still
 * appends its leads only once — callers guard with {@link isDone}. Pure-ish
 * (mutates its argument, touches nothing external).
 */
export function recordQuery(cp: Checkpoint, q: BatchQuery, found: Lead[]): Checkpoint {
  const key = queryKey(q);
  if (!cp.done.includes(key)) {
    cp.done.push(key);
    cp.leads.push(...found);
  }
  cp.updatedAt = new Date().toISOString();
  return cp;
}

/** The checkpoint filename that pairs with an output file. */
export function checkpointPath(out: string): string {
  return `${out}.checkpoint.json`;
}

/** Read a checkpoint file. Returns `undefined` if missing or unreadable. */
export function loadCheckpoint(file: string): Checkpoint | undefined {
  try {
    if (!existsSync(file)) return undefined;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Checkpoint>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.done) || !Array.isArray(parsed.leads)) {
      return undefined;
    }
    return parsed as Checkpoint;
  } catch {
    return undefined;
  }
}

/** Write a checkpoint atomically (temp file + rename), so a crash mid-write can't corrupt it. */
export function saveCheckpoint(file: string, cp: Checkpoint): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(cp));
  renameSync(tmp, file);
}

/** Delete a checkpoint file once a sweep finishes cleanly. Never throws. */
export function clearCheckpoint(file: string): void {
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* best-effort cleanup */
  }
}
