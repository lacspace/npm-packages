import { describe, it, expect } from "vitest";
import {
  spy,
  deepEqual,
  any,
  anything,
  predicate,
  stringMatching,
  objectContaining,
  arrayContaining,
  isMatcher,
} from "./index";

describe("matchers — type guards", () => {
  it("isMatcher recognises matchers and rejects plain data", () => {
    expect(isMatcher(any())).toBe(true);
    expect(isMatcher(objectContaining({}))).toBe(true);
    expect(isMatcher({})).toBe(false);
    expect(isMatcher(null)).toBe(false);
    expect(isMatcher(42)).toBe(false);
  });

  it("exposes a human-readable description", () => {
    expect(any(Number).description).toBe("any(Number)");
    expect(anything().description).toBe("anything()");
  });
});

describe("matchers — any / anything", () => {
  it("any(Number) matches numbers (primitive and boxed)", () => {
    expect(deepEqual(3, any(Number))).toBe(true);
    // eslint-disable-next-line no-new-wrappers
    expect(deepEqual(new Number(3), any(Number))).toBe(true);
    expect(deepEqual("3", any(Number))).toBe(false);
  });

  it("any(Date) matches by instance", () => {
    expect(deepEqual(new Date(), any(Date))).toBe(true);
    expect(deepEqual(123, any(Date))).toBe(false);
  });

  it("any() matches literally anything including null/undefined", () => {
    expect(deepEqual(null, any())).toBe(true);
    expect(deepEqual(undefined, any())).toBe(true);
    expect(deepEqual({ x: 1 }, any())).toBe(true);
  });

  it("anything() matches everything except null/undefined", () => {
    expect(deepEqual(0, anything())).toBe(true);
    expect(deepEqual("", anything())).toBe(true);
    expect(deepEqual(null, anything())).toBe(false);
    expect(deepEqual(undefined, anything())).toBe(false);
  });
});

describe("matchers — predicate / stringMatching", () => {
  it("predicate matches by custom function", () => {
    const even = predicate((n) => typeof n === "number" && n % 2 === 0, "even");
    expect(deepEqual(4, even)).toBe(true);
    expect(deepEqual(5, even)).toBe(false);
    expect(even.description).toBe("predicate(even)");
  });

  it("stringMatching matches substring and regexp, rejects non-strings", () => {
    expect(deepEqual("hello world", stringMatching("world"))).toBe(true);
    expect(deepEqual("hello", stringMatching("world"))).toBe(false);
    expect(deepEqual("abc123", stringMatching(/\d+/))).toBe(true);
    expect(deepEqual(123, stringMatching("1"))).toBe(false);
  });
});

describe("matchers — objectContaining / arrayContaining", () => {
  it("objectContaining ignores extra keys", () => {
    expect(deepEqual({ a: 1, b: 2 }, objectContaining({ a: 1 }))).toBe(true);
    expect(deepEqual({ a: 1 }, objectContaining({ a: 1, b: 2 }))).toBe(false);
    expect(deepEqual(42, objectContaining({ a: 1 }))).toBe(false);
  });

  it("nested matchers compose", () => {
    const m = objectContaining({ id: any(Number), name: stringMatching("Ada") });
    expect(deepEqual({ id: 7, name: "Ada Lovelace", extra: true }, m)).toBe(true);
    expect(deepEqual({ id: "7", name: "Ada" }, m)).toBe(false);
  });

  it("arrayContaining matches regardless of order/extras", () => {
    expect(deepEqual([1, 2, 3], arrayContaining([3, 1]))).toBe(true);
    expect(deepEqual([1, 2], arrayContaining([3]))).toBe(false);
    expect(deepEqual([{ a: 1 }], arrayContaining([objectContaining({ a: 1 })]))).toBe(true);
  });
});

describe("matchers — integration with calledWith", () => {
  it("spy.calledWith accepts matchers, including nested", () => {
    const s = spy();
    s(42, { user: "ada", role: "admin" });
    expect(s.calledWith(any(Number), objectContaining({ user: "ada" }))).toBe(true);
    expect(s.calledWith(any(String), anything())).toBe(false);
  });

  it("nthCalledWith / calledOnceWith honour matchers", () => {
    const s = spy();
    s("go", 1);
    expect(s.nthCalledWith(1, stringMatching("go"), any(Number))).toBe(true);
    expect(s.calledOnceWith(anything(), 1)).toBe(true);
  });
});
