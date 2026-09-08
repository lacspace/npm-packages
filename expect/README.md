<div align="center">

# @lacspace/expect

**A tiny, runner-agnostic fluent assertion library — `expect(...).toEqual(...)` anywhere. Zero dependencies, isomorphic, fully typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/expect?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/expect)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/expect?label=minzip)](https://bundlephobia.com/package/@lacspace/expect)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/expect)
[![license](https://img.shields.io/npm/l/@lacspace/expect?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A Jest-style `expect` you can use **without a test runner**. On failure it throws a descriptive `AssertionError`, so it drops straight into **vitest / jest / node:test** — but it also runs in the **browser, edge and serverless**, or anywhere you just want a rich `assert`. No `node:` imports, no dependencies.

> **New in 1.1.0** — 15 additional matchers (all `.not` / `.resolves` / `.rejects` aware, zero new deps): `toBeOneOf`, `toBeWithin`, `toStartWith`, `toEndWith`, `toBeEmpty`, `toHaveKeys`, `toIncludeSameMembers`, `toBeSorted`, and the type family `toBeArray` · `toBeBoolean` · `toBeString` · `toBeNumber` · `toBeFunction` · `toBeObject` · `toBeDate`. The matcher record is also exported as `extraMatchers` so you can register it into another `expect` instance.

- 🎯 **Familiar fluent API** — `expect(x).toEqual(y)`, `.not`, `.resolves`, `.rejects`
- 🧠 **Robust deep-equality** — primitives, arrays, plain objects, `Map`, `Set`, `Date`, `RegExp`, typed arrays, `NaN`, `+0/-0` and **circular references**
- 🧩 **Asymmetric matchers** — `expect.any`, `expect.objectContaining`, `expect.stringMatching`, … honored inside `toEqual`/`toMatchObject`
- 🔌 **`expect.extend`** — add your own typed matchers
- ⚡ **Runner-agnostic** — a failed assertion is a normal thrown `Error`; use it inside any framework or none
- 📝 **Descriptive failures** — expected vs received, with a circular-safe preview
- 🧰 Bonus `assert(cond)` + `assert.equal/notEqual/ok/throws`
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge) · fully typed

## Install

```bash
npm i @lacspace/expect
```

## Basic assertions

```ts
import { expect } from "@lacspace/expect";

expect(1 + 1).toBe(2);
expect({ a: [1, 2] }).toEqual({ a: [1, 2] });
expect("hello world").toContain("world");
expect([1, 2, 3]).toHaveLength(3);
expect(5).toBeGreaterThan(3); // each matcher throws on failure, returns void
```

## Negation, and it throws on failure

```ts
expect(1).not.toBe(2);          // ok
expect({ a: 1 }).toEqual({ a: 2 });
// ↑ throws AssertionError:
//   expect(received).toEqual(expected)
//
//   Expected: { a: 2 }
//   Received: { a: 1 }
```

## Deep equality that actually handles the hard cases

```ts
expect(new Map([["x", 1]])).toEqual(new Map([["x", 1]]));
expect(new Set([1, 2, 3])).toEqual(new Set([3, 2, 1]));
expect(new Uint8Array([1, 2])).toEqual(new Uint8Array([1, 2]));
expect(NaN).toEqual(NaN);

// circular references don't blow the stack:
const a: any = { name: "node" }; a.self = a;
const b: any = { name: "node" }; b.self = b;
expect(a).toEqual(b); // ✓
```

## Async: `.resolves` / `.rejects`

```ts
await expect(Promise.resolve({ id: 1 })).resolves.toEqual({ id: 1 });
await expect(loadUser(-1)).rejects.toThrow(RangeError);
await expect(fetchScore()).resolves.toBeGreaterThan(0);
```

## Asymmetric matchers

```ts
expect(user).toEqual({
  id: expect.any(Number),
  name: expect.stringMatching(/^A/),
  email: expect.stringContaining("@"),
  roles: expect.arrayContaining(["admin"]),
  meta: expect.objectContaining({ active: true }),
  score: expect.closeTo(0.3),
  createdAt: expect.any(Date),
});

expect([1, 2]).toEqual(expect.not.arrayContaining([9])); // inverted
```

## `toThrow`, `toMatchObject`, `toHaveProperty`

```ts
expect(() => JSON.parse("{")).toThrow();
expect(() => JSON.parse("{")).toThrow(SyntaxError);
expect(() => boom()).toThrow(/timeout/);

expect({ a: 1, b: 2, c: 3 }).toMatchObject({ a: 1, c: 3 });
expect({ a: { b: { c: 42 } } }).toHaveProperty("a.b.c", 42);
expect({ list: [10, 20] }).toHaveProperty(["list", 1], 20);
```

## More matchers (new in 1.1.0)

```ts
// value membership & ranges
expect("b").toBeOneOf(["a", "b", "c"]);
expect(5).toBeWithin(1, 10);            // half-open: [1, 10)

// strings
expect("hello world").toStartWith("hello");
expect("hello world").toEndWith("world");

// emptiness (string / array / Map / Set / iterable / object)
expect([]).toBeEmpty();
expect(new Map()).toBeEmpty();

// objects & collections
expect({ a: 1, b: 2 }).toHaveKeys(["a", "b"]);
expect([1, 2, 3]).toIncludeSameMembers([3, 1, 2]); // order-independent, deep-equal
expect([1, 2, 2, 3]).toBeSorted();
expect([3, 2, 1]).toBeSorted((a, b) => b - a);     // custom comparator

// type guards
expect([]).toBeArray();
expect("x").toBeString();
expect(42).toBeNumber();
expect(() => {}).toBeFunction();
expect({}).toBeObject();     // arrays are NOT objects here
expect(new Date()).toBeDate(); // must be a *valid* Date

// they compose with .not / .resolves / .rejects like every other matcher:
await expect(Promise.resolve(5)).resolves.toBeWithin(1, 10);
```

## Custom matchers with `expect.extend`

```ts
import { expect } from "@lacspace/expect";
import type { MatcherContext } from "@lacspace/expect";

expect.extend({
  toBeWithinRange(this: MatcherContext, received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expect(${received})${this.isNot ? ".not" : ""}.toBeWithinRange(${floor}, ${ceiling})`,
    };
  },
});

expect(7).toBeWithinRange(1, 10);

// For full typing, augment CustomMatchers via declaration merging:
declare module "@lacspace/expect" {
  interface CustomMatchers<R> {
    toBeWithinRange(floor: number, ceiling: number): R;
  }
}
```

## Bonus: a plain `assert`

```ts
import { assert } from "@lacspace/expect";

assert(user.isActive, "user must be active");
assert.ok(list.length);
assert.equal({ a: 1 }, { a: 1 });     // deep-equal
assert.strictEqual(ref, ref);          // Object.is
assert.notEqual(a, b);
assert.throws(() => risky(), /failed/);
```

## Use it inside any runner (or none)

Because a failed assertion is just a thrown `AssertionError`, `@lacspace/expect` needs no integration:

```ts
// node:test
import { test } from "node:test";
import { expect } from "@lacspace/expect";
test("adds", () => { expect(add(2, 2)).toBe(4); });

// or in the browser / a script, with zero test framework:
try { expect(config).toMatchObject({ mode: "prod" }); }
catch (e) { console.error(e.message); }
```

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `expect` | `expect<T>(value: T): Expectation<T>` | Start a fluent assertion. |
| `.not` | `Matchers` | Negate the next matcher. |
| `.resolves` / `.rejects` | `Matchers<Promise<void>>` | Await a promise, then assert on value / rejection. |
| `expect.any` | `(ctor) => AsymmetricMatcher` | Matches any value of that type. |
| `expect.anything` | `() => AsymmetricMatcher` | Matches anything but `null`/`undefined`. |
| `expect.stringContaining` | `(s) => AsymmetricMatcher` | Substring match. |
| `expect.stringMatching` | `(s\|re) => AsymmetricMatcher` | RegExp/string match. |
| `expect.arrayContaining` | `(arr) => AsymmetricMatcher` | Array superset match. |
| `expect.objectContaining` | `(obj) => AsymmetricMatcher` | Object subset match. |
| `expect.closeTo` | `(n, precision?) => AsymmetricMatcher` | Numeric closeness. |
| `expect.not.*` | same factories | Inverted asymmetric matchers. |
| `expect.extend` | `(matchers) => void` | Register custom matchers. |
| `expect.equals` | `(a, b, strict?) => boolean` | The deep-equality engine. |
| `extraMatchers` | `Record<string, RawMatcher>` | The 1.1.0 matcher record (already built in; re-register elsewhere via `expect.extend`). |
| `assert` | `(cond, msg?) => void` + `.ok/.equal/.notEqual/.strictEqual/.deepEqual/.throws` | Lightweight assert surface. |
| `equals` / `matchObject` | `(a, b, strict?)` / `(recv, subset)` | Standalone deep-equal / subset-match. |
| `format` | `(value) => string` | Circular-safe pretty-printer. |
| `AssertionError` | `class extends Error` | Thrown on every failure (carries `matcherResult`). |

### Matchers

`toBe` · `toEqual` · `toStrictEqual` · `toBeTruthy` · `toBeFalsy` · `toBeNull` · `toBeUndefined` · `toBeDefined` · `toBeNaN` · `toBeGreaterThan` · `toBeGreaterThanOrEqual` · `toBeLessThan` · `toBeLessThanOrEqual` · `toBeCloseTo` · `toContain` · `toContainEqual` · `toHaveLength` · `toHaveProperty` · `toMatch` · `toMatchObject` · `toThrow` · `toBeInstanceOf` · `toBeTypeOf` · `toSatisfy`

**Added in 1.1.0:** `toBeOneOf` · `toBeWithin` · `toStartWith` · `toEndWith` · `toBeEmpty` · `toHaveKeys` · `toIncludeSameMembers` · `toBeSorted` · `toBeArray` · `toBeBoolean` · `toBeString` · `toBeNumber` · `toBeFunction` · `toBeObject` · `toBeDate`

## Limitations

- **Not a test runner.** It provides assertions only — bring vitest/jest/node:test for test discovery, lifecycle hooks, mocks and snapshots.
- **No snapshot / mock matchers** (`toMatchSnapshot`, `toHaveBeenCalled`, …) — those are runner-specific.
- `toEqual` treats `+0` and `-0` as equal and ignores `undefined`-valued keys (use `toStrictEqual` for the stricter behavior); `toBe` uses `Object.is`.
- `toThrow` requires a **function** (or a rejected promise via `.rejects`), not an already-thrown value.
- Deep-equal compares own enumerable string + symbol keys; it does **not** compare non-enumerable properties or getters.
- No colorized terminal diff — messages are plain text (portable to the browser).

## Licence

Released under the **Lacspace Free Licence v1.0** — see [LICENSE](./LICENSE).

---

Part of the [**@lacspace**](https://developer.lacspace.com/packages) family of zero-dependency, isomorphic, fully-typed TypeScript packages.
