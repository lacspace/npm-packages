/**
 * Structural diff of two JSON values, reporting added / removed / changed leaves
 * with dotted / bracketed paths.
 */
import { deepEqual, isPlainObject } from "./util.js";
import type { JsonValue } from "./util.js";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  kind: DiffKind;
  path: string;
  before?: JsonValue;
  after?: JsonValue;
}

function join(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  return base === "" ? key : `${base}.${key}`;
}

function walk(a: JsonValue | undefined, b: JsonValue | undefined, path: string, out: DiffEntry[]): void {
  if (deepEqual(a, b)) return;
  const aMissing = a === undefined;
  const bMissing = b === undefined;
  if (aMissing && !bMissing) { out.push({ kind: "added", path, after: b }); return; }
  if (!aMissing && bMissing) { out.push({ kind: "removed", path, before: a }); return; }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      walk(
        Object.prototype.hasOwnProperty.call(a, k) ? a[k] : undefined,
        Object.prototype.hasOwnProperty.call(b, k) ? b[k] : undefined,
        join(path, k),
        out,
      );
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      walk(i < a.length ? a[i] : undefined, i < b.length ? b[i] : undefined, join(path, i), out);
    }
    return;
  }
  out.push({ kind: "changed", path: path === "" ? "$" : path, before: a, after: b });
}

/** Compute a flat list of differences turning `a` into `b`. */
export function diff(a: JsonValue, b: JsonValue): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(a, b, "", out);
  return out;
}

/** True if the two values are structurally identical. */
export function isEqual(a: JsonValue, b: JsonValue): boolean {
  return deepEqual(a, b);
}
