/**
 * Redaction — deterministically strip volatile values (timestamps, ids, tokens)
 * from a value *before* you serialize it, so snapshots stay stable without you
 * having to describe each field with a matcher.
 *
 * {@link redact} returns a deep copy of a value with the selected slots replaced
 * by a stable placeholder. It walks plain objects and arrays only; `Map`, `Set`,
 * `Date`, class instances and other objects are left intact when they are not
 * themselves redacted (redacting is by *slot*, so a `Date` stored under a matched
 * key still becomes the placeholder). It is a pure, isomorphic value transform —
 * it never touches {@link serialize}'s output for anything you don't redact.
 */

/** Context passed to a functional {@link RedactOptions.replacement}. */
export interface RedactContext {
  /** The original value being redacted. */
  value: unknown;
  /** The key (object property) or index (as a string) the value sits under. */
  key: string;
  /** The full dot-path to the value, e.g. `user.tokens.0`. The root path is `""`. */
  path: string;
}

/** Options controlling {@link redact}. All are opt-in; with none, nothing is redacted. */
export interface RedactOptions {
  /** Redact any property whose key equals a string or matches a `RegExp`. */
  keys?: Array<string | RegExp>;
  /**
   * Redact values at these dot-paths (array indices are numeric segments, e.g.
   * `items.0.id`). A `*` segment is a single-level wildcard (`items.*.id`).
   */
  paths?: string[];
  /** Redact when this returns `true`. Called for every visited value. */
  predicate?: (value: unknown, key: string, path: string) => boolean;
  /** Placeholder for a redacted value. Default `"[redacted]"`; may be a function. */
  replacement?: string | ((ctx: RedactContext) => unknown);
}

const DEFAULT_REPLACEMENT = "[redacted]";

function pathMatches(pattern: string, path: string): boolean {
  const pp = pattern.split(".");
  const sp = path.split(".");
  if (pp.length !== sp.length) return false;
  for (let i = 0; i < pp.length; i++) {
    if (pp[i] !== "*" && pp[i] !== sp[i]) return false;
  }
  return true;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Return a deep copy of `value` with volatile slots replaced by a stable
 * placeholder, selected by key name, dot-path and/or a predicate.
 *
 * @example
 * redact(
 *   { id: 42, name: "Ada", createdAt: new Date() },
 *   { keys: ["id", "createdAt"] },
 * );
 * // { id: "[redacted]", name: "Ada", createdAt: "[redacted]" }
 */
export function redact<T>(value: T, options: RedactOptions = {}): unknown {
  const keys = options.keys ?? [];
  const paths = options.paths ?? [];
  const predicate = options.predicate;
  const replacement = options.replacement ?? DEFAULT_REPLACEMENT;
  const seen = new Map<object, unknown>();

  function replacementFor(val: unknown, key: string, path: string): unknown {
    return typeof replacement === "function" ? replacement({ value: val, key, path }) : replacement;
  }

  function shouldRedact(val: unknown, key: string, path: string): boolean {
    for (const k of keys) {
      if (typeof k === "string" ? k === key : k.test(key)) return true;
    }
    for (const p of paths) {
      if (pathMatches(p, path)) return true;
    }
    if (predicate && predicate(val, key, path)) return true;
    return false;
  }

  function join(path: string, seg: string): string {
    return path ? `${path}.${seg}` : seg;
  }

  function walk(val: unknown, key: string, path: string): unknown {
    if (shouldRedact(val, key, path)) return replacementFor(val, key, path);
    if (typeof val !== "object" || val === null) return val;
    if (seen.has(val)) return seen.get(val);

    if (Array.isArray(val)) {
      const copy: unknown[] = [];
      seen.set(val, copy);
      for (let i = 0; i < val.length; i++) {
        copy[i] = walk(val[i], String(i), join(path, String(i)));
      }
      return copy;
    }
    if (isPlainObject(val)) {
      const copy: Record<string, unknown> = {};
      seen.set(val, copy);
      for (const k of Object.keys(val)) {
        copy[k] = walk(val[k], k, join(path, k));
      }
      return copy;
    }
    // Map/Set/Date/class instances etc. are left intact when not redacted by slot.
    return val;
  }

  return walk(value, "", "");
}
