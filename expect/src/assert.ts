/**
 * A tiny `assert` convenience surface, layered on the same deep-equality engine
 * and `AssertionError`. Zero `node:assert` dependency — works in the browser.
 */

import { equals } from "./equals";
import { format } from "./format";
import { AssertionError } from "./error";
import type { Constructor } from "./types";

export interface AssertFn {
  /** Throws `AssertionError(message)` when `condition` is falsy. */
  (condition: unknown, message?: string): asserts condition;
  /** Alias of the callable form. */
  ok(condition: unknown, message?: string): asserts condition;
  /** Deep-equality assertion (recursive, asymmetric-aware). */
  equal(actual: unknown, expected: unknown, message?: string): void;
  /** Negated deep-equality assertion. */
  notEqual(actual: unknown, expected: unknown, message?: string): void;
  /** Strict `Object.is` identity assertion. */
  strictEqual(actual: unknown, expected: unknown, message?: string): void;
  /** Strict deep-equality assertion (types & undefined keys significant). */
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  /** Asserts that `fn` throws (optionally matching message/RegExp/class). */
  throws(fn: () => unknown, expected?: string | RegExp | Constructor, message?: string): void;
}

function fail(message: string, actual?: unknown, expected?: unknown): never {
  throw new AssertionError(message, { pass: false, actual, expected });
}

const assertBase = (condition: unknown, message?: string): void => {
  if (!condition) fail(message ?? `Expected value to be truthy, received ${format(condition)}`);
};

export const assert: AssertFn = Object.assign(assertBase as AssertFn, {
  ok(condition: unknown, message?: string): void {
    if (!condition) fail(message ?? `Expected value to be truthy, received ${format(condition)}`);
  },
  equal(actual: unknown, expected: unknown, message?: string): void {
    if (!equals(actual, expected, false)) {
      fail(message ?? `Expected values to be deep-equal.\nExpected: ${format(expected)}\nReceived: ${format(actual)}`, actual, expected);
    }
  },
  notEqual(actual: unknown, expected: unknown, message?: string): void {
    if (equals(actual, expected, false)) {
      fail(message ?? `Expected values NOT to be deep-equal, but both were ${format(actual)}`, actual, expected);
    }
  },
  strictEqual(actual: unknown, expected: unknown, message?: string): void {
    if (!Object.is(actual, expected)) {
      fail(message ?? `Expected values to be identical (Object.is).\nExpected: ${format(expected)}\nReceived: ${format(actual)}`, actual, expected);
    }
  },
  deepEqual(actual: unknown, expected: unknown, message?: string): void {
    if (!equals(actual, expected, true)) {
      fail(message ?? `Expected values to be strictly deep-equal.\nExpected: ${format(expected)}\nReceived: ${format(actual)}`, actual, expected);
    }
  },
  throws(fn: () => unknown, expected?: string | RegExp | Constructor, message?: string): void {
    if (typeof fn !== "function") throw new TypeError("assert.throws expects a function");
    let error: unknown;
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
      error = e;
    }
    if (!threw) fail(message ?? "Expected function to throw, but it did not");
    if (expected !== undefined) {
      const msg = error instanceof Error ? error.message : String(error);
      let ok: boolean;
      if (typeof expected === "string") ok = msg.includes(expected);
      else if (expected instanceof RegExp) ok = expected.test(msg);
      else ok = error instanceof expected;
      if (!ok) {
        fail(message ?? `Function threw, but not matching ${format(expected)}.\nThrown: ${format(error)}`);
      }
    }
  },
});
