/**
 * Extra built-in matchers added in 1.1.0. Each returns `{ pass, message }`
 * exactly like the core matchers (see `matchers.ts`); the framework decides
 * success/failure from `pass` and `isNot` and only calls `message()` on throw.
 *
 * These are strictly additive: they are merged into the same global registry as
 * `builtinMatchers`, so they gain `.not`, `.resolves` and `.rejects` for free,
 * and honour asymmetric matchers wherever they compare with `equals`.
 */

import { equals } from "./equals";
import { format, diff, matcherHint, typeName } from "./format";
import type { MatcherContext, MatcherResult, RawMatcher } from "./types";

function hint(ctx: MatcherContext, name: string, comment?: string): string {
  return matcherHint(name, { isNot: ctx.isNot, comment });
}

/** True for an iterable value that is not a string. */
function isIterable(v: unknown): v is Iterable<unknown> {
  return (
    v != null &&
    typeof v !== "string" &&
    typeof (v as Iterable<unknown>)[Symbol.iterator] === "function"
  );
}

/** Multiset comparison by deep equality (order-independent). */
function sameMembers(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const used: boolean[] = new Array(b.length).fill(false);
  for (const x of a) {
    let found = false;
    for (let i = 0; i < b.length; i++) {
      if (!used[i] && equals(x, b[i])) {
        used[i] = true;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** Default ascending comparator (numbers, strings, anything relationally comparable). */
function defaultCompare(a: unknown, b: unknown): number {
  if ((a as never) < (b as never)) return -1;
  if ((a as never) > (b as never)) return 1;
  return 0;
}

export const extraMatchers: Record<string, RawMatcher> = {
  toBeOneOf(received, candidates) {
    if (!Array.isArray(candidates)) {
      throw new TypeError("toBeOneOf expects an array of candidates");
    }
    const pass = candidates.some((c) => equals(received, c));
    return {
      pass,
      expected: candidates,
      actual: received,
      message: () =>
        `${hint(this, "toBeOneOf")}\n\nExpected one of: ${format(candidates)}\nReceived: ${format(received)}`,
    };
  },

  toBeWithin(received, floor, ceiling) {
    const lo = floor as number;
    const hi = ceiling as number;
    const pass =
      typeof received === "number" &&
      Number.isFinite(received) &&
      received >= lo &&
      received < hi;
    return {
      pass,
      expected: [lo, hi],
      actual: received,
      message: () =>
        `${hint(this, "toBeWithin")}\n\nExpected within: [${format(lo)}, ${format(hi)})\nReceived: ${format(received)}`,
    };
  },

  toStartWith(received, prefix) {
    const pass = typeof received === "string" && received.startsWith(String(prefix));
    return {
      pass,
      expected: prefix,
      actual: received,
      message: () =>
        `${hint(this, "toStartWith")}\n\nExpected prefix: ${format(prefix)}\nReceived: ${format(received)}`,
    };
  },

  toEndWith(received, suffix) {
    const pass = typeof received === "string" && received.endsWith(String(suffix));
    return {
      pass,
      expected: suffix,
      actual: received,
      message: () =>
        `${hint(this, "toEndWith")}\n\nExpected suffix: ${format(suffix)}\nReceived: ${format(received)}`,
    };
  },

  toBeEmpty(received) {
    let pass = false;
    if (typeof received === "string" || Array.isArray(received)) {
      pass = (received as { length: number }).length === 0;
    } else if (received instanceof Map || received instanceof Set) {
      pass = received.size === 0;
    } else if (received != null && typeof (received as { length?: unknown }).length === "number") {
      pass = (received as { length: number }).length === 0;
    } else if (isIterable(received)) {
      pass = true;
      for (const _ of received) { pass = false; break; }
    } else if (received != null && typeof received === "object") {
      pass = Object.keys(received as object).length === 0;
    }
    return {
      pass,
      actual: received,
      message: () => `${hint(this, "toBeEmpty")}\n\nReceived: ${format(received)}`,
    };
  },

  toHaveKeys(received, keys) {
    const list = (Array.isArray(keys) ? keys : [keys]) as Array<string | symbol>;
    const isObj = received != null && (typeof received === "object" || typeof received === "function");
    const missing: Array<string | symbol> = [];
    if (isObj) {
      for (const k of list) if (!(k in (received as object))) missing.push(k);
    }
    const pass = isObj && missing.length === 0;
    return {
      pass,
      expected: list,
      actual: received,
      message: () => {
        let m = `${hint(this, "toHaveKeys")}\n\nExpected keys: ${format(list)}`;
        if (!isObj) m += `\nReceived is not an object: ${format(received)}`;
        else if (missing.length) m += `\nMissing keys: ${format(missing)}\nReceived: ${format(received)}`;
        else m += `\nReceived: ${format(received)}`;
        return m;
      },
    };
  },

  toIncludeSameMembers(received, members) {
    if (!Array.isArray(members)) {
      throw new TypeError("toIncludeSameMembers expects an array");
    }
    const pass = Array.isArray(received) && sameMembers(received, members);
    return {
      pass,
      expected: members,
      actual: received,
      message: () =>
        `${hint(this, "toIncludeSameMembers")}\n\n${diff(members, received)}`,
    };
  },

  toBeSorted(received, compareFn) {
    if (compareFn !== undefined && typeof compareFn !== "function") {
      throw new TypeError("toBeSorted expects an optional comparator function");
    }
    const cmp = (compareFn as ((a: unknown, b: unknown) => number) | undefined) ?? defaultCompare;
    let pass = Array.isArray(received);
    let badIndex = -1;
    if (pass) {
      const arr = received as unknown[];
      for (let i = 1; i < arr.length; i++) {
        if (cmp(arr[i - 1], arr[i]) > 0) {
          pass = false;
          badIndex = i;
          break;
        }
      }
    }
    return {
      pass,
      actual: received,
      message: () => {
        let m = `${hint(this, "toBeSorted")}\n\n`;
        if (!Array.isArray(received)) m += `Received value is not an array: ${format(received)}`;
        else if (badIndex >= 0) m += `Out of order at index ${badIndex}.\nReceived: ${format(received)}`;
        else m += `Received: ${format(received)}`;
        return m;
      },
    };
  },

  toBeArray(received) {
    const pass = Array.isArray(received);
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeArray")}\n\nExpected an array.\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeBoolean(received) {
    const pass = typeof received === "boolean";
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeBoolean")}\n\nExpected a boolean.\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeString(received) {
    const pass = typeof received === "string";
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeString")}\n\nExpected a string.\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeNumber(received) {
    const pass = typeof received === "number";
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeNumber")}\n\nExpected a number (typeof).\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeFunction(received) {
    const pass = typeof received === "function";
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeFunction")}\n\nExpected a function.\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeObject(received) {
    const pass = received !== null && typeof received === "object" && !Array.isArray(received);
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeObject")}\n\nExpected a non-array object.\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeDate(received) {
    const pass = received instanceof Date && !Number.isNaN(received.getTime());
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeDate")}\n\nExpected a valid Date.\nReceived: ${format(received)}`,
    };
  },
};
