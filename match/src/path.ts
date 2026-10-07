const BLOCKED = new Set(["__proto__", "prototype", "constructor"]);

/** Split "a.b.0.c" into segments. Empty segments are dropped. */
export function splitPath(path: string): string[] {
  return typeof path === "string" ? path.split(".").filter((s) => s.length > 0) : [];
}

/** True when a path is usable: non-empty, no prototype keys. */
export function isSafePath(path: unknown): path is string {
  if (typeof path !== "string" || !path.trim()) return false;
  const segs = splitPath(path);
  return segs.length > 0 && segs.every((s) => !BLOCKED.has(s));
}

const MAX_FAN_OUT = 10_000;

/**
 * Resolve a dotted path. Arrays along the way fan out: `to.address` on
 * `{ to: [{ address: "a" }, { address: "b" }] }` gives `["a", "b"]`. A numeric
 * segment indexes an array (`to.0.address`). Only own properties are read and
 * `__proto__` / `prototype` / `constructor` always resolve to undefined. Never throws.
 */
export function getPath(record: unknown, path: string): unknown {
  if (!isSafePath(path)) return undefined;
  let cur: unknown[] = [record];
  let fanned = false;
  try {
    for (const seg of splitPath(path)) {
      const next: unknown[] = [];
      for (const v of cur) {
        if (v == null) continue;
        if (Array.isArray(v)) {
          if (/^\d+$/.test(seg)) {
            const x = v[Number(seg)];
            if (x !== undefined) next.push(x);
          } else {
            fanned = true;
            for (const el of v) {
              if (el != null && typeof el === "object" && Object.prototype.hasOwnProperty.call(el, seg)) next.push((el as Record<string, unknown>)[seg]);
            }
          }
        } else if (typeof v === "object" && Object.prototype.hasOwnProperty.call(v, seg)) {
          next.push((v as Record<string, unknown>)[seg]);
        }
        if (next.length > MAX_FAN_OUT) break;
      }
      cur = next;
      if (!cur.length) return fanned ? [] : undefined;
    }
  } catch {
    return undefined;
  }
  return fanned ? cur : cur[0];
}
