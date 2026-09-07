import { createSpy } from "./spy";
import { register, deregister } from "./registry";
import type { AnyFn, Spy, SpyOnOptions } from "./types";

/** Find the property descriptor for `key`, walking the prototype chain. */
function findDescriptor(obj: object, key: PropertyKey): PropertyDescriptor | undefined {
  let target: object | null = obj;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) return descriptor;
    target = Object.getPrototypeOf(target) as object | null;
  }
  return undefined;
}

/**
 * Build the restore function for a patched member. Captures whether the object
 * had its OWN property before we patched it, so restore either re-defines the
 * original own descriptor or deletes the property we added.
 */
function makeRestore(obj: Record<PropertyKey, unknown>, key: PropertyKey): () => void {
  const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
  const ownDescriptor = Object.getOwnPropertyDescriptor(obj, key);
  return () => {
    if (hadOwn && ownDescriptor) {
      Object.defineProperty(obj, key, ownDescriptor);
    } else {
      delete obj[key];
    }
  };
}

function install<F extends AnyFn>(
  obj: object,
  key: PropertyKey,
  s: Spy<F>,
  apply: () => void,
): Spy<F> {
  const restoreMember = makeRestore(obj as Record<PropertyKey, unknown>, key);
  const entry = {
    restore(): void {
      restoreMember();
      deregister(entry);
    },
  };
  // Wrap the spy's own restore so it also undoes the patch + deregisters.
  s.restore = () => entry.restore();
  apply();
  register(entry);
  return s;
}

/**
 * Wrap an existing method (or accessor) with a spy that **calls through** to the
 * original by default while recording every call. Program it (`.returns`, etc.)
 * to override, and `.restore()` to put the original back.
 *
 * For getters/setters pass `{ accessType: "get" | "set" }`.
 */
export function spyOn<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  options?: SpyOnOptions,
): T[K] extends AnyFn ? Spy<T[K]> : Spy<AnyFn> {
  const accessType = options?.accessType;

  if (accessType) {
    const descriptor = findDescriptor(obj, key as PropertyKey);
    if (!descriptor || typeof descriptor[accessType] !== "function") {
      throw new Error(
        `spyOn: property "${String(key)}" has no ${accessType}ter to spy on`,
      );
    }
    const original = descriptor[accessType] as AnyFn;
    const s = createSpy({ defaultBehavior: { type: "fake", fn: original } });
    return install(obj, key as PropertyKey, s, () => {
      Object.defineProperty(obj, key as PropertyKey, {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get: accessType === "get" ? (s as unknown as () => unknown) : descriptor.get,
        set: accessType === "set" ? (s as unknown as (v: unknown) => void) : descriptor.set,
      });
    }) as never;
  }

  const original = (obj as Record<PropertyKey, unknown>)[key as PropertyKey];
  if (typeof original !== "function") {
    throw new Error(`spyOn: "${String(key)}" is not a method (got ${typeof original})`);
  }
  const s = createSpy({ defaultBehavior: { type: "fake", fn: (original as AnyFn).bind(obj) } });
  return install(obj, key as PropertyKey, s, () => {
    (obj as Record<PropertyKey, unknown>)[key as PropertyKey] = s;
  }) as never;
}

/**
 * Replace a method **entirely** with a spy (no call-through). Optionally supply
 * a fake `impl`; otherwise the stub returns `undefined`. `.restore()` puts the
 * original back.
 */
export function stub<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  impl?: T[K] extends AnyFn ? T[K] : AnyFn,
): T[K] extends AnyFn ? Spy<T[K]> : Spy<AnyFn> {
  const s = createSpy(
    impl ? { defaultBehavior: { type: "fake", fn: impl as AnyFn } } : {},
  );
  return install(obj, key as PropertyKey, s, () => {
    (obj as Record<PropertyKey, unknown>)[key as PropertyKey] = s;
  }) as never;
}
