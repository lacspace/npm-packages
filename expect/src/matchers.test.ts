import { describe, it, expect as vi } from "vitest";
import { expect, AssertionError } from "./index";

describe("core matchers", () => {
  it("toBe uses Object.is identity", () => {
    expect(1).toBe(1);
    expect("a").toBe("a");
    const o = {};
    expect(o).toBe(o);
    vi(() => expect({}).toBe({})).toThrow(AssertionError);
  });

  it("toBe distinguishes +0 and -0 but toEqual does not", () => {
    vi(() => expect(-0).toBe(0)).toThrow();
    expect(-0).toEqual(0);
    expect(NaN).toBe(NaN); // Object.is(NaN,NaN) === true
  });

  it("toEqual does recursive deep equality", () => {
    expect({ a: [1, 2, { b: 3 }] }).toEqual({ a: [1, 2, { b: 3 }] });
    vi(() => expect({ a: 1 }).toEqual({ a: 2 })).toThrow();
  });

  it("toEqual ignores undefined-valued keys, toStrictEqual does not", () => {
    expect({ a: 1, b: undefined }).toEqual({ a: 1 });
    vi(() => expect({ a: 1, b: undefined }).toStrictEqual({ a: 1 })).toThrow();
  });

  it("toStrictEqual distinguishes class instances from plain objects", () => {
    class Foo { constructor(public x = 1) {} }
    expect(new Foo()).toEqual({ x: 1 });
    vi(() => expect(new Foo()).toStrictEqual({ x: 1 })).toThrow();
  });

  it("truthiness matchers", () => {
    expect(1).toBeTruthy();
    expect(0).toBeFalsy();
    expect("").toBeFalsy();
    expect("x").toBeTruthy();
  });

  it("null / undefined / defined / NaN", () => {
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
    expect(1).toBeDefined();
    expect(NaN).toBeNaN();
    vi(() => expect(1).toBeNaN()).toThrow();
  });

  it("numeric comparisons", () => {
    expect(5).toBeGreaterThan(3);
    expect(5).toBeGreaterThanOrEqual(5);
    expect(3).toBeLessThan(5);
    expect(3).toBeLessThanOrEqual(3);
    vi(() => expect(3).toBeGreaterThan(5)).toThrow();
  });

  it("toBeCloseTo", () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
    vi(() => expect(0.1 + 0.2).toBeCloseTo(0.4)).toThrow();
    expect(Infinity).toBeCloseTo(Infinity);
  });

  it("toContain and toContainEqual", () => {
    expect([1, 2, 3]).toContain(2);
    expect("hello world").toContain("world");
    expect(new Set([1, 2])).toContain(1);
    vi(() => expect([{ a: 1 }]).toContain({ a: 1 })).toThrow();
    expect([{ a: 1 }]).toContainEqual({ a: 1 });
  });

  it("toHaveLength", () => {
    expect([1, 2, 3]).toHaveLength(3);
    expect("abc").toHaveLength(3);
    vi(() => expect([1]).toHaveLength(2)).toThrow();
  });

  it("toHaveProperty with path and value", () => {
    const o = { a: { b: { c: 42 } }, list: [10, 20] };
    expect(o).toHaveProperty("a.b.c");
    expect(o).toHaveProperty("a.b.c", 42);
    expect(o).toHaveProperty(["list", 1], 20);
    vi(() => expect(o).toHaveProperty("a.b.z")).toThrow();
    vi(() => expect(o).toHaveProperty("a.b.c", 43)).toThrow();
  });

  it("toMatch string and RegExp", () => {
    expect("hello").toMatch("ell");
    expect("hello").toMatch(/^h.*o$/);
    vi(() => expect("hello").toMatch("xyz")).toThrow();
  });

  it("toMatchObject subset semantics", () => {
    expect({ a: 1, b: 2, c: 3 }).toMatchObject({ a: 1, c: 3 });
    expect({ nested: { x: 1, y: 2 } }).toMatchObject({ nested: { x: 1 } });
    vi(() => expect({ a: 1 }).toMatchObject({ a: 2 })).toThrow();
  });

  it("toThrow variants", () => {
    const boom = () => {
      throw new TypeError("kaboom happened");
    };
    expect(boom).toThrow();
    expect(boom).toThrow("kaboom");
    expect(boom).toThrow(/kab/);
    expect(boom).toThrow(TypeError);
    vi(() => expect(() => {}).toThrow()).toThrow();
    vi(() => expect(boom).toThrow(RangeError)).toThrow();
  });

  it("toBeInstanceOf / toBeTypeOf / toSatisfy", () => {
    expect(new Date()).toBeInstanceOf(Date);
    expect([]).toBeInstanceOf(Array);
    expect("x").toBeTypeOf("string");
    expect(42).toBeTypeOf("number");
    expect(10).toSatisfy((n: number) => n % 2 === 0);
    vi(() => expect(11).toSatisfy((n: number) => n % 2 === 0)).toThrow();
  });
});

describe("negation with .not", () => {
  it("negates positive matchers", () => {
    expect(1).not.toBe(2);
    expect({ a: 1 }).not.toEqual({ a: 2 });
    expect([1, 2]).not.toContain(3);
    expect(5).not.toBeGreaterThan(9);
  });

  it("throws when a negated matcher unexpectedly passes", () => {
    vi(() => expect(1).not.toBe(1)).toThrow(AssertionError);
    vi(() => expect({ a: 1 }).not.toEqual({ a: 1 })).toThrow();
  });
});

describe("failure messages", () => {
  it("throws AssertionError with a descriptive message", () => {
    let err: unknown;
    try {
      expect({ a: 1 }).toEqual({ a: 2 });
    } catch (e) {
      err = e;
    }
    vi(err).toBeInstanceOf(AssertionError);
    const msg = (err as Error).message;
    vi(msg).toContain("toEqual");
    vi(msg).toContain("Expected:");
    vi(msg).toContain("Received:");
  });

  it("hints to use toEqual when toBe fails on equal objects", () => {
    let msg = "";
    try {
      expect({ a: 1 }).toBe({ a: 1 });
    } catch (e) {
      msg = (e as Error).message;
    }
    vi(msg).toContain("toEqual");
  });
});
