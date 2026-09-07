/**
 * Built-in matcher implementations. Each returns `{ pass, message }`; the
 * framework (see `expect.ts`) decides success/failure from `pass` and `isNot`
 * and only calls `message()` when it needs to throw.
 */

import { equals, matchObject } from "./equals";
import { format, diff, matcherHint, typeName } from "./format";
import type { MatcherContext, MatcherResult, RawMatcher, Constructor } from "./types";

function hint(ctx: MatcherContext, name: string, comment?: string): string {
  return matcherHint(name, { isNot: ctx.isNot, comment });
}

/** Build a `{ pass, message }` result with a standard two-line body. */
function res(
  ctx: MatcherContext,
  name: string,
  pass: boolean,
  expected: unknown,
  received: unknown,
  comment?: string,
): MatcherResult {
  return {
    pass,
    expected,
    actual: received,
    message: () =>
      `${hint(ctx, name, comment)}\n\n${diff(expected, received)}`,
  };
}

function asNumber(v: unknown): number | bigint {
  return v as number | bigint;
}

export const builtinMatchers: Record<string, RawMatcher> = {
  toBe(received, expected) {
    const pass = Object.is(received, expected);
    return {
      pass,
      expected,
      actual: received,
      message: () => {
        const base = `${hint(this, "toBe")}\n\n${diff(expected, received)}`;
        if (!this.isNot && !pass && equals(received, expected)) {
          return base + "\n\nNote: values are deeply equal but not the same reference — use toEqual().";
        }
        return base;
      },
    };
  },

  toEqual(received, expected) {
    const pass = equals(received, expected, false);
    return res(this, "toEqual", pass, expected, received);
  },

  toStrictEqual(received, expected) {
    const pass = equals(received, expected, true);
    return res(this, "toStrictEqual", pass, expected, received);
  },

  toBeTruthy(received) {
    const pass = Boolean(received);
    return {
      pass,
      actual: received,
      message: () => `${hint(this, "toBeTruthy")}\n\nReceived: ${format(received)}`,
    };
  },

  toBeFalsy(received) {
    const pass = !received;
    return {
      pass,
      actual: received,
      message: () => `${hint(this, "toBeFalsy")}\n\nReceived: ${format(received)}`,
    };
  },

  toBeNull(received) {
    return {
      pass: received === null,
      actual: received,
      message: () => `${hint(this, "toBeNull")}\n\nReceived: ${format(received)}`,
    };
  },

  toBeUndefined(received) {
    return {
      pass: received === undefined,
      actual: received,
      message: () => `${hint(this, "toBeUndefined")}\n\nReceived: ${format(received)}`,
    };
  },

  toBeDefined(received) {
    return {
      pass: received !== undefined,
      actual: received,
      message: () => `${hint(this, "toBeDefined")}\n\nReceived: ${format(received)}`,
    };
  },

  toBeNaN(received) {
    return {
      pass: typeof received === "number" && Number.isNaN(received),
      actual: received,
      message: () => `${hint(this, "toBeNaN")}\n\nReceived: ${format(received)}`,
    };
  },

  toBeGreaterThan(received, expected) {
    const pass = asNumber(received) > asNumber(expected);
    return res(this, "toBeGreaterThan", pass, expected, received);
  },
  toBeGreaterThanOrEqual(received, expected) {
    const pass = asNumber(received) >= asNumber(expected);
    return res(this, "toBeGreaterThanOrEqual", pass, expected, received);
  },
  toBeLessThan(received, expected) {
    const pass = asNumber(received) < asNumber(expected);
    return res(this, "toBeLessThan", pass, expected, received);
  },
  toBeLessThanOrEqual(received, expected) {
    const pass = asNumber(received) <= asNumber(expected);
    return res(this, "toBeLessThanOrEqual", pass, expected, received);
  },

  toBeCloseTo(received, expected, numDigits = 2) {
    let pass: boolean;
    let diffVal = Infinity;
    if (typeof received !== "number") {
      pass = false;
    } else if (!Number.isFinite(received) || !Number.isFinite(expected)) {
      pass = Object.is(received, expected);
    } else {
      diffVal = Math.abs(expected - received);
      pass = diffVal < 0.5 * Math.pow(10, -numDigits);
    }
    return {
      pass,
      expected,
      actual: received,
      message: () =>
        `${hint(this, "toBeCloseTo", `${numDigits} digits`)}\n\n${diff(expected, received)}` +
        (Number.isFinite(diffVal) ? `\nDifference: ${diffVal}` : ""),
    };
  },

  toContain(received, item) {
    let pass = false;
    if (typeof received === "string") {
      pass = received.includes(String(item));
    } else if (Array.isArray(received)) {
      pass = received.some((x) => Object.is(x, item));
    } else if (received != null && typeof (received as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const x of received as Iterable<unknown>) {
        if (Object.is(x, item)) { pass = true; break; }
      }
    }
    return {
      pass,
      expected: item,
      actual: received,
      message: () =>
        `${hint(this, "toContain")}\n\nContainer: ${format(received)}\nItem: ${format(item)}`,
    };
  },

  toContainEqual(received, item) {
    let pass = false;
    if (received != null && typeof (received as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const x of received as Iterable<unknown>) {
        if (equals(x, item)) { pass = true; break; }
      }
    }
    return {
      pass,
      expected: item,
      actual: received,
      message: () =>
        `${hint(this, "toContainEqual")}\n\nContainer: ${format(received)}\nItem: ${format(item)}`,
    };
  },

  toHaveLength(received, expected) {
    const len = received == null ? undefined : (received as { length?: unknown }).length;
    const pass = len === expected;
    return {
      pass,
      expected,
      actual: len,
      message: () =>
        `${hint(this, "toHaveLength")}\n\nExpected length: ${format(expected)}\nReceived length: ${format(len)}\nReceived: ${format(received)}`,
    };
  },

  toHaveProperty(received, path, ...rest) {
    const keys: Array<string | number> = Array.isArray(path)
      ? path
      : String(path).split(".");
    let cur: unknown = received;
    let exists = true;
    for (const k of keys) {
      if (cur != null && (typeof cur === "object" || typeof cur === "function") && k in (cur as object)) {
        cur = (cur as Record<string | number, unknown>)[k];
      } else {
        exists = false;
        break;
      }
    }
    const hasValue = rest.length > 0;
    const expectedValue = rest[0];
    const pass = exists && (!hasValue || equals(cur, expectedValue));
    return {
      pass,
      expected: hasValue ? expectedValue : undefined,
      actual: exists ? cur : undefined,
      message: () => {
        const p = Array.isArray(path) ? path.join(".") : String(path);
        let m = `${hint(this, "toHaveProperty")}\n\nPath: ${format(p)}`;
        if (!exists) m += `\nProperty not found on: ${format(received)}`;
        else if (hasValue) m += `\n\n${diff(expectedValue, cur)}`;
        else m += `\nValue: ${format(cur)}`;
        return m;
      },
    };
  },

  toMatch(received, expected) {
    if (typeof received !== "string") {
      return {
        pass: false,
        actual: received,
        message: () => `${hint(this, "toMatch")}\n\nReceived value must be a string.\nReceived: ${format(received)}`,
      };
    }
    const pass = expected instanceof RegExp
      ? expected.test(received)
      : received.includes(expected);
    return {
      pass,
      expected,
      actual: received,
      message: () =>
        `${hint(this, "toMatch")}\n\nExpected ${expected instanceof RegExp ? "pattern" : "substring"}: ${format(expected)}\nReceived string: ${format(received)}`,
    };
  },

  toMatchObject(received, expected) {
    const pass = matchObject(received, expected);
    return res(this, "toMatchObject", pass, expected, received);
  },

  toThrow(received, expected) {
    let threw = false;
    let error: unknown;
    if (this.promise === "rejects") {
      // Received is already the rejection reason.
      threw = true;
      error = received;
    } else if (typeof received === "function") {
      try {
        received();
      } catch (e) {
        threw = true;
        error = e;
      }
    } else if (received instanceof Error) {
      threw = true;
      error = received;
    } else {
      return {
        pass: false,
        actual: received,
        message: () =>
          `${hint(this, "toThrow")}\n\nReceived value must be a function (or a rejected promise via .rejects).\nReceived: ${format(received)}`,
      };
    }

    let pass = threw;
    const msg = error instanceof Error ? error.message : String(error);
    if (threw && expected !== undefined) {
      if (typeof expected === "string") {
        pass = msg.includes(expected);
      } else if (expected instanceof RegExp) {
        pass = expected.test(msg);
      } else if (expected instanceof Error) {
        pass = msg === expected.message;
      } else if (typeof expected === "function") {
        pass = error instanceof (expected as Constructor);
      }
    }

    return {
      pass,
      expected,
      actual: error,
      message: () => {
        let m = `${hint(this, "toThrow")}\n\n`;
        if (!threw) {
          m += "Expected the function to throw, but it did not.";
        } else if (expected === undefined) {
          m += `Thrown: ${format(error)}`;
        } else {
          m += `Expected: ${format(expected)}\nThrown message: ${format(msg)}`;
        }
        return m;
      },
    };
  },

  toBeInstanceOf(received, cls) {
    if (typeof cls !== "function") {
      throw new TypeError("toBeInstanceOf expects a constructor");
    }
    const pass = received instanceof (cls as Constructor);
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toBeInstanceOf")}\n\nExpected instance of: ${(cls as { name?: string }).name || format(cls)}\nReceived: ${format(received)} (${typeName(received)})`,
    };
  },

  toBeTypeOf(received, type) {
    const pass = typeof received === type;
    return {
      pass,
      expected: type,
      actual: received,
      message: () =>
        `${hint(this, "toBeTypeOf")}\n\nExpected typeof: ${format(type)}\nReceived typeof: ${format(typeof received)}\nReceived: ${format(received)}`,
    };
  },

  toSatisfy(received, predicate) {
    if (typeof predicate !== "function") {
      throw new TypeError("toSatisfy expects a predicate function");
    }
    const pass = Boolean(predicate(received));
    return {
      pass,
      actual: received,
      message: () =>
        `${hint(this, "toSatisfy")}\n\nReceived value did not satisfy the predicate.\nReceived: ${format(received)}`,
    };
  },
};
