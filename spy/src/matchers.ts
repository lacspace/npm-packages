import { deepEqual } from "./equal";

/**
 * Brand symbol identifying an argument matcher. Only values carrying this tag
 * are treated specially by {@link deepEqual} (and therefore by `calledWith`,
 * `nthCalledWith`, etc.), so plain data is never mistaken for a matcher.
 */
export const MATCHER = Symbol.for("@lacspace/spy.matcher");

/**
 * A flexible argument matcher. Pass one anywhere a concrete argument is
 * expected — e.g. `spy.calledWith(any(Number), objectContaining({ ok: true }))` —
 * and it matches by predicate instead of by value.
 */
export interface Matcher {
  readonly [MATCHER]: true;
  /** Return `true` if `value` satisfies this matcher. */
  test(value: unknown): boolean;
  /** Human-readable label, handy in assertion messages. */
  readonly description: string;
}

/** Type guard: is `value` a Lacspace argument matcher? */
export function isMatcher(value: unknown): value is Matcher {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[MATCHER] === true
  );
}

function make(description: string, test: (value: unknown) => boolean): Matcher {
  return { [MATCHER]: true, description, test };
}

type Ctor = abstract new (...args: any[]) => unknown;

function matchesType(value: unknown, ctor: Ctor): boolean {
  if (ctor === (Number as unknown)) return typeof value === "number" || value instanceof Number;
  if (ctor === (String as unknown)) return typeof value === "string" || value instanceof String;
  if (ctor === (Boolean as unknown)) return typeof value === "boolean" || value instanceof Boolean;
  if (ctor === (BigInt as unknown)) return typeof value === "bigint";
  if (ctor === (Symbol as unknown)) return typeof value === "symbol";
  if (ctor === (Function as unknown)) return typeof value === "function";
  if (ctor === (Object as unknown)) return value !== null && typeof value === "object";
  if (ctor === (Array as unknown)) return Array.isArray(value);
  try {
    return value != null && value instanceof ctor;
  } catch {
    return false;
  }
}

/**
 * Match any value of a given type. With a constructor it works like Jest's
 * `expect.any` — `any(Number)` matches `3` and `new Number(3)`, `any(Date)`
 * matches any `Date`. With no constructor it matches literally anything
 * (including `null`/`undefined`).
 */
export function any(ctor?: Ctor): Matcher {
  if (ctor === undefined) return make("any()", () => true);
  const name = (ctor as { name?: string }).name || "value";
  return make(`any(${name})`, (value) => matchesType(value, ctor));
}

/** Match any value that is neither `null` nor `undefined` (like Jest's `anything`). */
export function anything(): Matcher {
  return make("anything()", (value) => value !== null && value !== undefined);
}

/** Match with a custom predicate. `desc` is used only in the description. */
export function predicate(fn: (value: unknown) => boolean, desc = "predicate"): Matcher {
  return make(`predicate(${desc})`, (value) => Boolean(fn(value)));
}

/**
 * Match a string. A `RegExp` matches by `.test`; a plain string matches when the
 * value **contains** it as a substring. Non-strings never match.
 */
export function stringMatching(pattern: string | RegExp): Matcher {
  const label = pattern instanceof RegExp ? String(pattern) : JSON.stringify(pattern);
  return make(`stringMatching(${label})`, (value) => {
    if (typeof value !== "string") return false;
    return pattern instanceof RegExp ? pattern.test(value) : value.includes(pattern);
  });
}

/**
 * Match an object that contains (at least) the given properties, each compared
 * with {@link deepEqual}. Extra properties on the value are ignored, and the
 * partial may itself contain nested matchers.
 */
export function objectContaining(partial: Record<PropertyKey, unknown>): Matcher {
  return make("objectContaining(...)", (value) => {
    if (value === null || typeof value !== "object") return false;
    const target = value as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(partial)) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) return false;
      if (!deepEqual(target[key], partial[key])) return false;
    }
    return true;
  });
}

/**
 * Match an array (or iterable-backed array) that contains each of `items`,
 * compared with {@link deepEqual}. Items may be matchers; order and extras are
 * ignored.
 */
export function arrayContaining(items: readonly unknown[]): Matcher {
  return make("arrayContaining(...)", (value) => {
    if (!Array.isArray(value)) return false;
    return items.every((item) => value.some((el) => deepEqual(el, item)));
  });
}
