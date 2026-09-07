/**
 * Structural deep-equality used by {@link Spy.calledWith}.
 *
 * Handles primitives (with `NaN === NaN` and `+0 !== -0`), arrays, plain
 * objects, `Date`, `RegExp`, `Map` and `Set`. Functions and other references
 * fall back to identity (`===`). Guards against cyclic structures.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b, new WeakMap());
}

function equal(a: unknown, b: unknown, seen: WeakMap<object, unknown>): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  // Cycle guard: if we've already paired `a` with `b`, treat as equal.
  const prev = seen.get(a);
  if (prev === b) return true;
  seen.set(a, b);

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }

  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!equal(a[i], b[i], seen)) return false;
    }
    return true;
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !equal(v, b.get(k), seen)) return false;
    }
    return true;
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], seen)) {
      return false;
    }
  }
  return true;
}
