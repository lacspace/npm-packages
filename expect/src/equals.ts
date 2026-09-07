/**
 * Deep-equality engine.
 *
 * Handles primitives, arrays, plain objects, Map, Set, Date, RegExp, typed
 * arrays / ArrayBuffer, NaN, +0/-0 and CIRCULAR references. It is also aware of
 * asymmetric matchers (any object exposing an `asymmetricMatch` method), so
 * `expect.any(Number)` and friends work inside `toEqual`/`toMatchObject`.
 */

/** Duck-type an asymmetric matcher without importing its class (avoids cycles). */
export function isAsymmetric(v: unknown): v is { asymmetricMatch(o: unknown): boolean } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { asymmetricMatch?: unknown }).asymmetricMatch === "function"
  );
}

const toStr = Object.prototype.toString;
function tag(v: unknown): string {
  return toStr.call(v);
}

function isTypedArray(v: unknown): v is ArrayBufferView {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

/** Own enumerable string keys plus symbol keys of an object. */
function ownKeys(obj: object, strict: boolean): Array<string | symbol> {
  const keys: Array<string | symbol> = Object.keys(obj);
  for (const s of Object.getOwnPropertySymbols(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, s);
    if (desc && desc.enumerable) keys.push(s);
  }
  if (!strict) {
    // In loose mode, drop keys whose value is `undefined` so that
    // `{ a: 1, b: undefined }` deep-equals `{ a: 1 }`.
    return keys.filter((k) => (obj as Record<string | symbol, unknown>)[k] !== undefined);
  }
  return keys;
}

/**
 * Deep-equality check.
 * @param strict when true, also compares constructors/type tags, treats
 *   `undefined` object keys as significant and distinguishes sparse arrays.
 */
export function equals(a: unknown, b: unknown, strict = false): boolean {
  return eq(a, b, strict, [], []);
}

function eq(
  a: unknown,
  b: unknown,
  strict: boolean,
  aStack: unknown[],
  bStack: unknown[],
): boolean {
  // Asymmetric matchers (on either side) short-circuit.
  if (isAsymmetric(b)) return b.asymmetricMatch(a);
  if (isAsymmetric(a)) return a.asymmetricMatch(b);

  // Fast path: identical (covers same ref, and equal primitives incl. +0===-0).
  if (a === b) return true;

  // NaN
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }

  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  // At this point both are non-null objects.
  const ta = tag(a);
  const tb = tag(b);
  if (ta !== tb) return false;

  switch (ta) {
    case "[object Date]":
      // Equal times (both invalid => equal).
      return Object.is((a as Date).getTime(), (b as Date).getTime()) ||
        (Number.isNaN((a as Date).getTime()) && Number.isNaN((b as Date).getTime()));
    case "[object RegExp]":
      return (a as RegExp).source === (b as RegExp).source &&
        (a as RegExp).flags === (b as RegExp).flags;
    case "[object String]":
    case "[object Number]":
    case "[object Boolean]":
      // Boxed primitives.
      return eq((a as object).valueOf(), (b as object).valueOf(), strict, aStack, bStack);
    case "[object Symbol]":
      return (a as object).valueOf() === (b as object).valueOf();
  }

  // Circular reference handling.
  for (let i = 0; i < aStack.length; i++) {
    if (aStack[i] === a) return bStack[i] === b;
  }
  aStack.push(a);
  bStack.push(b);
  try {
    // Map
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      for (const [k, v] of a) {
        // Fast key lookup; fall back to structural key match for object keys.
        if (b.has(k)) {
          if (!eq(v, b.get(k), strict, aStack, bStack)) return false;
        } else {
          let found = false;
          for (const [bk, bv] of b) {
            if (eq(k, bk, strict, aStack, bStack) && eq(v, bv, strict, aStack, bStack)) {
              found = true;
              break;
            }
          }
          if (!found) return false;
        }
      }
      return true;
    }

    // Set
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      for (const v of a) {
        if (b.has(v)) continue;
        let found = false;
        for (const bv of b) {
          if (eq(v, bv, strict, aStack, bStack)) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
      return true;
    }

    // ArrayBuffer
    if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
      if (a.byteLength !== b.byteLength) return false;
      const va = new Uint8Array(a);
      const vb = new Uint8Array(b);
      for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
      return true;
    }

    // Typed arrays / DataView
    if (isTypedArray(a) && isTypedArray(b)) {
      const va = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const vb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (va.length !== vb.length) return false;
      for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
      return true;
    }

    // Arrays
    const aIsArr = Array.isArray(a);
    const bIsArr = Array.isArray(b);
    if (aIsArr || bIsArr) {
      if (!aIsArr || !bIsArr) return false;
      const arrA = a as unknown[];
      const arrB = b as unknown[];
      if (arrA.length !== arrB.length) return false;
      for (let i = 0; i < arrA.length; i++) {
        if (strict) {
          // Distinguish holes from explicit undefined.
          const hasA = i in arrA;
          const hasB = i in arrB;
          if (hasA !== hasB) return false;
        }
        if (!eq(arrA[i], arrB[i], strict, aStack, bStack)) return false;
      }
      return true;
    }

    // In strict mode, require the same prototype/constructor.
    if (strict) {
      const pa = Object.getPrototypeOf(a);
      const pb = Object.getPrototypeOf(b);
      if (pa !== pb) return false;
    }

    // Plain objects (and class instances).
    const keysA = ownKeys(a, strict);
    const keysB = ownKeys(b, strict);
    if (keysA.length !== keysB.length) return false;
    const setB = new Set(keysB);
    for (const k of keysA) {
      if (!setB.has(k)) return false;
      if (!eq(
        (a as Record<string | symbol, unknown>)[k],
        (b as Record<string | symbol, unknown>)[k],
        strict,
        aStack,
        bStack,
      )) return false;
    }
    return true;
  } finally {
    aStack.pop();
    bStack.pop();
  }
}

/**
 * Subset match used by `toMatchObject`. Every property present in `subset`
 * must exist and (recursively) match in `received`; extra keys in `received`
 * are ignored. Arrays must be the same length and match element-wise.
 * Asymmetric matchers are honored.
 */
export function matchObject(received: unknown, subset: unknown): boolean {
  return sub(received, subset, [], []);
}

function sub(
  received: unknown,
  subset: unknown,
  rStack: unknown[],
  sStack: unknown[],
): boolean {
  if (isAsymmetric(subset)) return subset.asymmetricMatch(received);
  if (subset === received) return true;

  if (Array.isArray(subset)) {
    if (!Array.isArray(received)) return false;
    if (received.length !== subset.length) return false;
    for (let i = 0; i < subset.length; i++) {
      if (!sub(received[i], subset[i], rStack, sStack)) return false;
    }
    return true;
  }

  if (
    typeof subset === "object" &&
    subset !== null &&
    typeof received === "object" &&
    received !== null &&
    tag(subset) === "[object Object]" &&
    tag(received) === "[object Object]"
  ) {
    // Circular guard.
    for (let i = 0; i < sStack.length; i++) {
      if (sStack[i] === subset) return rStack[i] === received;
    }
    sStack.push(subset);
    rStack.push(received);
    try {
      for (const k of Object.keys(subset as object)) {
        const sv = (subset as Record<string, unknown>)[k];
        if (!(k in (received as object))) {
          if (sv === undefined) continue;
          return false;
        }
        if (!sub((received as Record<string, unknown>)[k], sv, rStack, sStack)) return false;
      }
      return true;
    } finally {
      sStack.pop();
      rStack.pop();
    }
  }

  // Fall back to deep equality for everything else.
  return equals(received, subset);
}
