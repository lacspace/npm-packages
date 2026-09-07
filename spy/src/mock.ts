import { spy } from "./spy";
import type { AnyFn, Mocked } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Turn every function on `shape` into a spy, recursing into nested plain
 * objects. Functions become spies that delegate to the original implementation
 * (so real behaviour is kept unless you program them); other values are copied
 * as-is. The input is not mutated.
 *
 * ```ts
 * const svc = mockObject({ save: (x: number) => x * 2, name: "db" });
 * svc.save(21);                 // → 42, and recorded
 * svc.save.calledWith(21);      // → true
 * ```
 */
export function mockObject<T extends object>(shape: T): Mocked<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const value = (shape as Record<string, unknown>)[key];
    if (typeof value === "function") {
      out[key] = spy(value as AnyFn);
    } else if (isPlainObject(value)) {
      out[key] = mockObject(value);
    } else {
      out[key] = value;
    }
  }
  return out as Mocked<T>;
}

/**
 * Build a typed mock of `T`.
 *
 * - With a `shape`, behaves like {@link mockObject}: real functions become spies.
 * - Without a `shape`, returns an **auto-mock** — a proxy that lazily creates a
 *   fresh no-op spy the first time any property is accessed and remembers it,
 *   so `m.anything` is always a `Spy`. Great for interfaces you only partially
 *   exercise.
 *
 * ```ts
 * interface Logger { info(msg: string): void; warn(msg: string): void }
 * const log = mock<Logger>();
 * log.info("hi");
 * log.info.calledWith("hi"); // → true
 * ```
 */
export function mock<T extends object>(shape?: Partial<T>): Mocked<T> {
  if (shape) return mockObject(shape as object) as unknown as Mocked<T>;

  const cache = new Map<PropertyKey, unknown>();
  const proxy = new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive || prop === Symbol.iterator) return undefined;
      if (!cache.has(prop)) cache.set(prop, spy());
      return cache.get(prop);
    },
    set(_target, prop, value) {
      cache.set(prop, value);
      return true;
    },
    has() {
      return true;
    },
  });
  return proxy as unknown as Mocked<T>;
}
