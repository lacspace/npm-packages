import type { SerializeOptions, SerializerPlugin } from "./types";
import { serialize } from "./serialize";

/**
 * Property matchers — assert the *shape* of a value while ignoring volatile
 * fields (ids, dates, random tokens) so the resulting snapshot stays stable.
 *
 * You embed matcher tokens ({@link any}, {@link stringMatching}, …) inside an
 * expected "shape" and pass it to {@link serializeWithMatchers}. Each matched
 * field is validated and then rendered as a stable label (e.g. `Any<String>`)
 * instead of its real, changing value. Unmentioned fields serialize normally.
 *
 * This never changes {@link serialize}'s default output — it is a separate,
 * opt-in serialization path built on top of it.
 */

const MATCHER = Symbol.for("@lacspace/snapshot.matcher");

/** A single property matcher: a labelled predicate over one value. */
export interface PropertyMatcher {
  /** Brand so {@link isMatcher} can recognise a matcher token. */
  readonly [MATCHER]: true;
  /** Stable label rendered in place of a matched value, e.g. `Any<String>`. */
  readonly label: string;
  /** Return `true` when `value` satisfies this matcher. */
  test(value: unknown): boolean;
}

/** Result returned by {@link serializeWithMatchers}. */
export interface MatchResult {
  /** `true` when every embedded matcher (and every literal leaf) was satisfied. */
  pass: boolean;
  /**
   * The value serialized with satisfied matchers replaced by their labels, so
   * volatile fields become deterministic. On failure, unsatisfied fields keep
   * their real serialized value so the diff is meaningful.
   */
  actual: string;
  /** One human-readable message per validation failure (empty when `pass`). */
  errors: string[];
}

/** Type guard: is `value` a {@link PropertyMatcher} token? */
export function isMatcher(value: unknown): value is PropertyMatcher {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[MATCHER] === true &&
    typeof (value as PropertyMatcher).test === "function"
  );
}

function matcher(label: string, test: (value: unknown) => boolean): PropertyMatcher {
  return { [MATCHER]: true, label, test };
}

/** Matches any value that is not `null` or `undefined`. */
export function anything(): PropertyMatcher {
  return matcher("Anything", (v) => v !== null && v !== undefined);
}

/**
 * Matches by constructor, jest-style. Primitives match via `typeof`
 * (`any(String)` matches `"x"`), boxed/instances match via `instanceof`.
 */
export function any(constructor: unknown): PropertyMatcher {
  const name = (constructor as { name?: string })?.name || "Object";
  return matcher(`Any<${name}>`, (v) => {
    switch (constructor) {
      case String:
        return typeof v === "string" || v instanceof String;
      case Number:
        return typeof v === "number" || v instanceof Number;
      case Boolean:
        return typeof v === "boolean" || v instanceof Boolean;
      case BigInt:
        return typeof v === "bigint";
      case Symbol:
        return typeof v === "symbol";
      case Function:
        return typeof v === "function";
      case Object:
        return typeof v === "object" && v !== null;
      default:
        return typeof constructor === "function" && v instanceof (constructor as new () => unknown);
    }
  });
}

/** Matches a string that matches the given substring or `RegExp`. */
export function stringMatching(pattern: string | RegExp): PropertyMatcher {
  const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  return matcher(`StringMatching(${re.toString()})`, (v) => typeof v === "string" && re.test(v));
}

/** Matches a string that contains `substring`. */
export function stringContaining(substring: string): PropertyMatcher {
  return matcher(
    `StringContaining(${JSON.stringify(substring)})`,
    (v) => typeof v === "string" && v.includes(substring),
  );
}

/**
 * Matches a number within `10 ** -precision / 2` of `expected` (jest semantics).
 * Handy for floating-point results. `precision` defaults to `2`.
 */
export function closeTo(expected: number, precision = 2): PropertyMatcher {
  return matcher(`CloseTo(${expected}, ${precision})`, (v) => {
    if (typeof v !== "number" || Number.isNaN(v)) return false;
    if (!Number.isFinite(v) || !Number.isFinite(expected)) return v === expected;
    return Math.abs(expected - v) < Math.pow(10, -precision) / 2;
  });
}

/** Matches an array that contains every one of `items` (each may itself be a matcher). */
export function arrayContaining(items: readonly unknown[]): PropertyMatcher {
  return matcher("ArrayContaining", (v) => {
    if (!Array.isArray(v)) return false;
    return items.every((item) => v.some((el) => matchesValue(item, el)));
  });
}

/** Matches an object that contains every key of `shape` with a matching value. */
export function objectContaining(shape: Record<string, unknown>): PropertyMatcher {
  return matcher("ObjectContaining", (v) => {
    if (typeof v !== "object" || v === null) return false;
    return Object.keys(shape).every((k) =>
      Object.prototype.hasOwnProperty.call(v, k) &&
      matchesValue(shape[k], (v as Record<string, unknown>)[k]),
    );
  });
}

/** Deep structural equality that also understands embedded matcher tokens. */
function matchesValue(expected: unknown, actual: unknown): boolean {
  if (isMatcher(expected)) return expected.test(actual);
  if (Object.is(expected, actual)) return true;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((e, i) => matchesValue(e, actual[i]));
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) return false;
    const ek = Object.keys(expected);
    const ak = Object.keys(actual);
    if (ek.length !== ak.length) return false;
    return ek.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(actual, k) &&
        matchesValue((expected as Record<string, unknown>)[k], (actual as Record<string, unknown>)[k]),
    );
  }
  return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// Internal placeholder rendered verbatim by the injected serializer.
class Replacement {
  constructor(readonly label: string) {}
}

const replacementPlugin: SerializerPlugin = {
  test: (v) => v instanceof Replacement,
  serialize: (v) => (v as Replacement).label,
};

function fail(path: string, expectedLabel: string, actual: unknown): string {
  return `${path || "<root>"}: expected ${expectedLabel}, received ${serialize(actual)}`;
}

function decorate(value: unknown, shape: unknown, path: string, errors: string[]): unknown {
  if (isMatcher(shape)) {
    if (shape.test(value)) return new Replacement(shape.label);
    errors.push(fail(path, shape.label, value));
    return value;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) {
      errors.push(fail(path, "Array", value));
      return value;
    }
    const out = value.slice();
    for (let i = 0; i < shape.length; i++) {
      out[i] = decorate(value[i], shape[i], `${path}[${i}]`, errors);
    }
    return out;
  }
  if (isPlainObject(shape)) {
    if (typeof value !== "object" || value === null) {
      errors.push(fail(path, "Object", value));
      return value;
    }
    // Preserve the prototype so class-instance labels stay intact.
    const out = Object.assign(Object.create(Object.getPrototypeOf(value)), value) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(shape)) {
      const p = path ? `${path}.${key}` : key;
      out[key] = decorate((value as Record<string, unknown>)[key], shape[key], p, errors);
    }
    return out;
  }
  // Literal leaf in the shape: require strict equality.
  if (!Object.is(value, shape)) {
    errors.push(`${path || "<root>"}: expected ${serialize(shape)}, received ${serialize(value)}`);
  }
  return value;
}

/**
 * Serialize `value` while validating it against `shape` — a copy of the value
 * with matcher tokens ({@link any}, {@link stringMatching}, …) in the volatile
 * spots. Matched fields render as stable labels; everything else serializes
 * exactly as {@link serialize} would.
 *
 * @example
 * serializeWithMatchers(
 *   { id: crypto.randomUUID(), name: "Ada", createdAt: new Date() },
 *   { id: any(String), createdAt: any(Date) },
 * ).actual;
 * // Object {
 * //   "createdAt": Any<Date>,
 * //   "id": Any<String>,
 * //   "name": "Ada",
 * // }
 */
export function serializeWithMatchers(
  value: unknown,
  shape: unknown,
  options: SerializeOptions = {},
): MatchResult {
  const errors: string[] = [];
  const decorated = decorate(value, shape, "", errors);
  const actual = serialize(decorated, {
    ...options,
    serializers: [...(options.serializers ?? []), replacementPlugin],
  });
  return { pass: errors.length === 0, actual, errors };
}
