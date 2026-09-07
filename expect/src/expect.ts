/**
 * The `expect` entry point: builds the fluent, typed matcher object, wires
 * `.not` / `.resolves` / `.rejects`, and carries the asymmetric-matcher and
 * `extend` statics.
 */

import { equals } from "./equals";
import { format, diff, matcherHint } from "./format";
import { builtinMatchers } from "./matchers";
import { makeAsymmetric } from "./asymmetric";
import { AssertionError } from "./error";
import type {
  Expectation,
  Matchers,
  MatcherContext,
  MatcherResult,
  MatcherUtils,
  RawMatcher,
  Constructor,
  AsymmetricMatcher,
} from "./types";

/** Global matcher registry (built-ins + anything added via `expect.extend`). */
const registry: Record<string, RawMatcher> = { ...builtinMatchers };

const utils: MatcherUtils = {
  format,
  printExpected: format,
  printReceived: format,
  diff,
  matcherHint,
};

function contextFor(isNot: boolean, promise: MatcherContext["promise"]): MatcherContext {
  return { isNot, promise, equals, utils };
}

/** Decide pass/fail from the raw result and throw `AssertionError` on failure. */
function check(result: MatcherResult, isNot: boolean): void {
  // Success when the raw pass differs from the negation flag.
  if (result.pass !== isNot) return;
  const body = result.message();
  const header = isNot
    ? body // hint already contains `.not`
    : body;
  throw new AssertionError(header, {
    pass: result.pass,
    actual: result.actual,
    expected: result.expected,
  });
}

/** Build a matcher bag over a concrete received value (synchronous run). */
function syncBag(received: unknown, isNot: boolean): Record<string, (...args: unknown[]) => void> {
  const ctx = contextFor(isNot, "");
  const bag: Record<string, (...args: unknown[]) => void> = {};
  for (const name of Object.keys(registry)) {
    const fn = registry[name] as RawMatcher;
    bag[name] = (...args: unknown[]) => {
      check(fn.apply(ctx, [received, ...args]), isNot);
    };
  }
  return bag;
}

/** Build a matcher bag whose methods await `promise` first (async run). */
function asyncBag(
  promise: unknown,
  isNot: boolean,
  kind: "resolves" | "rejects",
): Record<string, (...args: unknown[]) => Promise<void>> {
  const ctx = contextFor(isNot, kind);
  const bag: Record<string, (...args: unknown[]) => Promise<void>> = {};
  for (const name of Object.keys(registry)) {
    const fn = registry[name] as RawMatcher;
    bag[name] = async (...args: unknown[]) => {
      let received: unknown;
      if (kind === "resolves") {
        try {
          received = await (promise as Promise<unknown>);
        } catch (e) {
          throw new AssertionError(
            `${matcherHint(name, { comment: "resolves" })}\n\n` +
              `Expected the promise to resolve, but it rejected with:\n${format(e)}`,
          );
        }
      } else {
        let rejected = false;
        let reason: unknown;
        try {
          await (promise as Promise<unknown>);
        } catch (e) {
          rejected = true;
          reason = e;
        }
        if (!rejected) {
          throw new AssertionError(
            `${matcherHint(name, { comment: "rejects" })}\n\n` +
              `Expected the promise to reject, but it resolved.`,
          );
        }
        received = reason;
      }
      check(fn.apply(ctx, [received, ...args]), isNot);
    };
  }
  return bag;
}

function attachAsync(promise: unknown, kind: "resolves" | "rejects") {
  const bag = asyncBag(promise, false, kind);
  Object.defineProperty(bag, "not", {
    enumerable: false,
    get: () => asyncBag(promise, true, kind),
  });
  return bag;
}

/** The public `expect(value)` factory. */
export interface ExpectStatic {
  <T = unknown>(received: T): Expectation<T>;

  /** Matches any value created by the given constructor / of the primitive type. */
  any(ctor: Constructor): AsymmetricMatcher;
  /** Matches anything except `null`/`undefined`. */
  anything(): AsymmetricMatcher;
  /** Matches a string containing the given substring. */
  stringContaining(sample: string): AsymmetricMatcher;
  /** Matches a string against the given RegExp / pattern. */
  stringMatching(sample: string | RegExp): AsymmetricMatcher;
  /** Matches an array that contains all the given elements (deep-equal). */
  arrayContaining(sample: unknown[]): AsymmetricMatcher;
  /** Matches an object that contains the given key/value subset. */
  objectContaining(sample: Record<string, unknown>): AsymmetricMatcher;
  /** Matches a number within `precision` decimal places (default 2). */
  closeTo(sample: number, precision?: number): AsymmetricMatcher;

  /** Inverted asymmetric matchers, e.g. `expect.not.arrayContaining([...])`. */
  not: {
    any(ctor: Constructor): AsymmetricMatcher;
    anything(): AsymmetricMatcher;
    stringContaining(sample: string): AsymmetricMatcher;
    stringMatching(sample: string | RegExp): AsymmetricMatcher;
    arrayContaining(sample: unknown[]): AsymmetricMatcher;
    objectContaining(sample: Record<string, unknown>): AsymmetricMatcher;
    closeTo(sample: number, precision?: number): AsymmetricMatcher;
  };

  /** Register custom matchers (jest-style `{ pass, message }` return). */
  extend(matchers: Record<string, RawMatcher>): void;

  /** The deep-equality engine used internally (asymmetric-aware). */
  equals(a: unknown, b: unknown, strict?: boolean): boolean;
}

function expectImpl<T = unknown>(received: T): Expectation<T> {
  const base = syncBag(received, false) as unknown as Expectation<T>;
  Object.defineProperty(base, "not", {
    enumerable: false,
    get: () => syncBag(received, true) as unknown as Matchers<void>,
  });
  Object.defineProperty(base, "resolves", {
    enumerable: false,
    get: () => attachAsync(received, "resolves"),
  });
  Object.defineProperty(base, "rejects", {
    enumerable: false,
    get: () => attachAsync(received, "rejects"),
  });
  return base;
}

const asym = makeAsymmetric(false);
const asymNot = makeAsymmetric(true);

export const expect: ExpectStatic = Object.assign(expectImpl, {
  any: asym.any,
  anything: asym.anything,
  stringContaining: asym.stringContaining,
  stringMatching: asym.stringMatching,
  arrayContaining: asym.arrayContaining,
  objectContaining: asym.objectContaining,
  closeTo: asym.closeTo,
  not: asymNot,
  extend(matchers: Record<string, RawMatcher>): void {
    for (const name of Object.keys(matchers)) {
      const fn = matchers[name];
      if (typeof fn !== "function") {
        throw new TypeError(`expect.extend: matcher "${name}" must be a function`);
      }
      registry[name] = fn;
    }
  },
  equals,
});
