/**
 * Async materialisation. Factories stay synchronous and deterministic, but a
 * `build(ctx)` may legitimately produce `Promise`-valued fields (a hashed
 * password, a fetched token, a persisted row's id). `deepAwait` walks the built
 * value and resolves any promises it finds, so `factory.buildAsync()` returns a
 * fully-settled object.
 *
 * Only plain objects and arrays are traversed — `Date`, `Map`, class instances
 * and other non-plain values are returned as-is (their promise fields, if any,
 * are your responsibility), matching the deep-merge rules elsewhere.
 */

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isThenable(v: unknown): v is Promise<unknown> {
  return (
    (typeof v === "object" || typeof v === "function") &&
    v !== null &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

/**
 * Recursively resolve every `Promise` reachable through plain objects and
 * arrays, returning a settled clone. Non-promise, non-container values pass
 * through untouched.
 */
export async function deepAwait<T>(value: T): Promise<Awaited<T>> {
  const resolved = isThenable(value) ? await value : value;

  if (Array.isArray(resolved)) {
    const out = await Promise.all(resolved.map((v) => deepAwait(v)));
    return out as Awaited<T>;
  }
  if (isPlainRecord(resolved)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(resolved)) {
      out[key] = await deepAwait(resolved[key]);
    }
    return out as Awaited<T>;
  }
  return resolved as Awaited<T>;
}
