/**
 * Pure change-monitoring helpers — a stable hash, JSON path access, feed-item
 * extraction, watch-type inference and snapshot diffing. All exported and
 * unit-tested; no network or disk here.
 */
import type { Snapshot, Watch, WatchType } from "./types.js";

/** A stable, fast 53-bit hash of a string, as hex. Pure. (cyrb53) */
export function hashValue(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

/** Read a dot/bracket path (`a.b.0.c` or `a[0].c`) out of a value. Pure. */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.replace(/\[(\w+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(p)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

/** Coerce any value to the string we snapshot/compare. Pure. */
export function toValueString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Extract stable item ids from an RSS/Atom XML string or a JSON Feed. Prefers
 * guid/id, falls back to link/url, then title. Pure.
 */
export function feedItemIds(body: string): string[] {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as { items?: { id?: string; url?: string; title?: string }[] };
      return (json.items ?? []).map((it) => it.id || it.url || it.title || "").filter(Boolean);
    } catch {
      return [];
    }
  }
  const ids: string[] = [];
  const blocks = body.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const guid = block.match(/<guid[^>]*>\s*([\s\S]*?)\s*<\/guid>/i)?.[1];
    const id = block.match(/<id[^>]*>\s*([\s\S]*?)\s*<\/id>/i)?.[1];
    const linkHref = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const linkText = block.match(/<link[^>]*>\s*([\s\S]*?)\s*<\/link>/i)?.[1];
    const title = block.match(/<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i)?.[1];
    const raw = (guid || id || linkHref || linkText || title || "").trim();
    if (raw) ids.push(raw.replace(/<!\[CDATA\[|\]\]>/g, "").trim());
  }
  return ids;
}

/** Infer a watch's type from its fields. Pure. */
export function inferType(watch: Watch): WatchType {
  if (watch.type) return watch.type;
  if (watch.path) return "json";
  if (watch.selector) return "selector";
  return "page";
}

/** A stable id for a watch when none is given. Pure. */
export function watchId(watch: Watch): string {
  if (watch.id) return watch.id;
  const key = [inferType(watch), watch.url, watch.selector ?? "", watch.attr ?? "", watch.path ?? ""].join("|");
  return hashValue(key);
}

/** Build a snapshot from a scalar value. */
export function snapshotValue(value: string): Snapshot {
  return { hash: hashValue(value), value, at: new Date().toISOString() };
}

/** Build a snapshot from feed item ids. */
export function snapshotItems(items: string[]): Snapshot {
  return { hash: hashValue(items.join("\n")), items, at: new Date().toISOString() };
}

/** Diff two snapshots. Pure. `type === "feed"` compares item sets. */
export function diffSnapshots(
  prev: Snapshot | undefined,
  next: Snapshot,
  type: WatchType,
): { changed: boolean; before?: string; after?: string; added?: string[]; removed?: string[] } {
  if (!prev) return { changed: false };
  if (type === "feed") {
    const prevSet = new Set(prev.items ?? []);
    const nextSet = new Set(next.items ?? []);
    const added = (next.items ?? []).filter((i) => !prevSet.has(i));
    const removed = (prev.items ?? []).filter((i) => !nextSet.has(i));
    return { changed: added.length > 0 || removed.length > 0, added, removed };
  }
  const changed = prev.hash !== next.hash;
  const out: { changed: boolean; before?: string; after?: string } = { changed };
  if (changed) { out.before = prev.value ?? ""; out.after = next.value ?? ""; }
  return out;
}
