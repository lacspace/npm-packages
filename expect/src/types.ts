/**
 * Shared public types for @lacspace/expect.
 */

/** The result a matcher returns. `pass` is whether the (non-negated) assertion held. */
export interface MatcherResult {
  /** Whether the assertion passed (before `.not` negation is applied). */
  pass: boolean;
  /** Lazily builds the failure message. Only called when the assertion fails. */
  message: () => string;
  /** Optional: the actual value, for tooling. */
  actual?: unknown;
  /** Optional: the expected value, for tooling. */
  expected?: unknown;
}

/** Formatting/printing helpers passed to every matcher via `this.utils`. */
export interface MatcherUtils {
  /** Pretty-print any value (handles circular refs, Map, Set, typed arrays, …). */
  format(value: unknown): string;
  /** Print an expected value (alias of `format`, semantic marker). */
  printExpected(value: unknown): string;
  /** Print a received value (alias of `format`, semantic marker). */
  printReceived(value: unknown): string;
  /** A small "Expected: … / Received: …" block. */
  diff(expected: unknown, received: unknown): string;
  /** A `expect(received).matcherName(expected)` hint line. */
  matcherHint(name: string, options?: { isNot?: boolean; comment?: string }): string;
}

/** `this` context available inside a matcher implementation. */
export interface MatcherContext {
  /** True when the assertion was reached through `.not`. */
  isNot: boolean;
  /** Which async wrapper (if any) produced the received value. */
  promise: "resolves" | "rejects" | "";
  /** The deep-equality engine (asymmetric-matcher aware). */
  equals(a: unknown, b: unknown, strict?: boolean): boolean;
  /** Printing/formatting helpers. */
  utils: MatcherUtils;
}

/** A raw matcher implementation, as registered via `expect.extend`. */
export type RawMatcher = (
  this: MatcherContext,
  received: any,
  ...args: any[]
) => MatcherResult;

/** A `typeof` result string, used by `toBeTypeOf`. */
export type TypeOfResult =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "undefined"
  | "object"
  | "function";

/** Any constructor. */
export type Constructor = new (...args: any[]) => any;

/**
 * The full built-in matcher surface. `R` is the return type of each matcher
 * (`void` for sync, `Promise<void>` for the `.resolves`/`.rejects` variants).
 *
 * Custom matchers added with `expect.extend` are reachable through the index
 * signature; augment this interface via declaration merging for full typing.
 */
export interface Matchers<R = void> {
  /** Strict `Object.is` identity (primitives, same reference). */
  toBe(expected: unknown): R;
  /** Recursive deep equality (undefined-valued keys ignored). */
  toEqual(expected: unknown): R;
  /** Recursive deep equality, also checking types & undefined keys. */
  toStrictEqual(expected: unknown): R;
  /** Value is truthy. */
  toBeTruthy(): R;
  /** Value is falsy. */
  toBeFalsy(): R;
  /** Value is `null`. */
  toBeNull(): R;
  /** Value is `undefined`. */
  toBeUndefined(): R;
  /** Value is not `undefined`. */
  toBeDefined(): R;
  /** Value is `NaN`. */
  toBeNaN(): R;
  /** Numeric `>`. */
  toBeGreaterThan(expected: number | bigint): R;
  /** Numeric `>=`. */
  toBeGreaterThanOrEqual(expected: number | bigint): R;
  /** Numeric `<`. */
  toBeLessThan(expected: number | bigint): R;
  /** Numeric `<=`. */
  toBeLessThanOrEqual(expected: number | bigint): R;
  /** Floating-point closeness to `numDigits` decimal places (default 2). */
  toBeCloseTo(expected: number, numDigits?: number): R;
  /** Array/string/iterable contains item (identity). */
  toContain(item: unknown): R;
  /** Array/iterable contains an item that deep-equals `item`. */
  toContainEqual(item: unknown): R;
  /** `value.length === expected`. */
  toHaveLength(expected: number): R;
  /** Property at `path` exists (and optionally deep-equals `value`). */
  toHaveProperty(path: string | Array<string | number>, value?: unknown): R;
  /** String contains substring / matches RegExp. */
  toMatch(expected: string | RegExp): R;
  /** Object matches the given subset (recursively, asymmetric-aware). */
  toMatchObject(expected: object): R;
  /** Calling `value` (a function) throws; optional message/RegExp/class filter. */
  toThrow(expected?: string | RegExp | Error | Constructor): R;
  /** `value instanceof cls`. */
  toBeInstanceOf(cls: Constructor): R;
  /** `typeof value === type`. */
  toBeTypeOf(type: TypeOfResult): R;
  /** `predicate(value)` returns truthy. */
  toSatisfy(predicate: (value: any) => boolean): R;
}

/**
 * Merge target for custom matchers added with `expect.extend`. Augment this
 * interface via TypeScript declaration merging to type your own matchers, e.g.
 * `declare module "@lacspace/expect" { interface CustomMatchers<R> { toBeEven(): R } }`.
 * Custom matchers are always callable at runtime; without an augmentation reach
 * them through a cast.
 */
export interface CustomMatchers<R = void> {
  [name: string]: (...args: any[]) => R;
}

/** The set of matchers reachable in one direction (positive or negated). */
export type AllMatchers<R = void> = Matchers<R> & CustomMatchers<R>;

/** What `expect(value)` returns. */
export type Expectation<T = unknown> = AllMatchers<void> & {
  /** Negates the next matcher. */
  not: AllMatchers<void>;
  /** Awaits the value (a Promise) and asserts on the resolved value. */
  resolves: AllMatchers<Promise<void>> & { not: AllMatchers<Promise<void>> };
  /** Awaits the value (a Promise) and asserts on the rejection reason. */
  rejects: AllMatchers<Promise<void>> & { not: AllMatchers<Promise<void>> };
};

/** An asymmetric matcher (e.g. `expect.any(String)`), usable inside `toEqual`. */
export interface AsymmetricMatcher {
  /** Returns true when `other` satisfies this matcher. */
  asymmetricMatch(other: unknown): boolean;
  /** A short label used in messages, e.g. `Any<String>`. */
  toAsymmetricMatcher(): string;
  toString(): string;
}
