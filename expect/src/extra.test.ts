import { describe, it, expect as vi } from "vitest";
import { expect, extraMatchers } from "./index";

describe("extra matchers (1.1.0)", () => {
  it("toBeOneOf uses deep equality", () => {
    expect("b").toBeOneOf(["a", "b", "c"]);
    expect({ a: 1 }).toBeOneOf([{ a: 2 }, { a: 1 }]);
    expect(3).not.toBeOneOf([1, 2]);
    vi(() => expect(9).toBeOneOf([1, 2, 3])).toThrow();
    vi(() => (expect(1) as any).toBeOneOf(5)).toThrow();
  });

  it("toBeWithin is half-open [floor, ceiling)", () => {
    expect(5).toBeWithin(1, 10);
    expect(1).toBeWithin(1, 10); // floor inclusive
    expect(10).not.toBeWithin(1, 10); // ceiling exclusive
    expect(Infinity).not.toBeWithin(1, 10);
    vi(() => expect(0).toBeWithin(1, 10)).toThrow();
  });

  it("toStartWith / toEndWith on strings", () => {
    expect("hello world").toStartWith("hello");
    expect("hello world").toEndWith("world");
    expect("hello").not.toStartWith("x");
    vi(() => expect("hello").toEndWith("x")).toThrow();
    vi(() => (expect(123) as any).toStartWith("1")).toThrow();
  });

  it("toBeEmpty across container kinds", () => {
    expect("").toBeEmpty();
    expect([]).toBeEmpty();
    expect({}).toBeEmpty();
    expect(new Map()).toBeEmpty();
    expect(new Set()).toBeEmpty();
    expect([1]).not.toBeEmpty();
    expect({ a: 1 }).not.toBeEmpty();
    vi(() => expect("x").toBeEmpty()).toThrow();
  });

  it("toHaveKeys checks presence of all keys", () => {
    expect({ a: 1, b: 2, c: 3 }).toHaveKeys(["a", "b"]);
    expect({ a: 1 }).toHaveKeys("a");
    expect({ a: 1 }).not.toHaveKeys(["a", "z"]);
    vi(() => expect({ a: 1 }).toHaveKeys(["b"])).toThrow();
    vi(() => expect(null).toHaveKeys(["a"])).toThrow();
  });

  it("toIncludeSameMembers ignores order, honours multiplicity", () => {
    expect([1, 2, 3]).toIncludeSameMembers([3, 2, 1]);
    expect([{ a: 1 }, { b: 2 }]).toIncludeSameMembers([{ b: 2 }, { a: 1 }]);
    expect([1, 1, 2]).not.toIncludeSameMembers([1, 2, 2]);
    vi(() => expect([1, 2]).toIncludeSameMembers([1, 2, 3])).toThrow();
  });

  it("toBeSorted default and custom comparator", () => {
    expect([1, 2, 2, 3]).toBeSorted();
    expect(["a", "b", "c"]).toBeSorted();
    expect([3, 2, 1]).toBeSorted((a: number, b: number) => b - a);
    expect([3, 1, 2]).not.toBeSorted();
    vi(() => expect([2, 1]).toBeSorted()).toThrow();
    vi(() => (expect([]) as any).toBeSorted(5)).toThrow();
  });

  it("type matchers: array/boolean/string/number/function/object/date", () => {
    expect([]).toBeArray();
    expect(true).toBeBoolean();
    expect("x").toBeString();
    expect(42).toBeNumber();
    expect(() => {}).toBeFunction();
    expect({}).toBeObject();
    expect(new Date()).toBeDate();

    expect([]).not.toBeObject(); // arrays are not "objects" here
    expect(new Date("nope")).not.toBeDate(); // invalid date
    vi(() => expect("x").toBeNumber()).toThrow();
    vi(() => expect(1).toBeString()).toThrow();
  });

  it("new matchers chain through resolves/rejects", async () => {
    await expect(Promise.resolve(5)).resolves.toBeWithin(1, 10);
    await expect(Promise.resolve("hi there")).resolves.toStartWith("hi");
    await expect(Promise.reject(new Error("boom"))).rejects.toBeInstanceOf(Error);
  });

  it("extraMatchers is exported and registerable via expect.extend", () => {
    vi(typeof extraMatchers.toBeOneOf).toBe("function");
    vi(Object.keys(extraMatchers).length).toBe(15);
  });

  it("failure messages carry the matcher hint", () => {
    let msg = "";
    try {
      expect(9).toBeOneOf([1, 2]);
    } catch (e) {
      msg = (e as Error).message;
    }
    vi(msg).toContain("toBeOneOf");
    vi(msg).toContain("Received:");
  });
});
