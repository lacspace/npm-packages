import { describe, it, expect as vi } from "vitest";
import { assert, AssertionError } from "./index";

describe("assert convenience surface", () => {
  it("assert(condition) throws on falsy", () => {
    assert(true);
    assert(1);
    vi(() => assert(false)).toThrow(AssertionError);
    vi(() => assert(0, "custom message")).toThrow("custom message");
  });

  it("assert.ok", () => {
    assert.ok("non-empty");
    vi(() => assert.ok("")).toThrow(AssertionError);
  });

  it("assert.equal is deep", () => {
    assert.equal({ a: [1, 2] }, { a: [1, 2] });
    vi(() => assert.equal({ a: 1 }, { a: 2 })).toThrow();
  });

  it("assert.notEqual", () => {
    assert.notEqual({ a: 1 }, { a: 2 });
    vi(() => assert.notEqual({ a: 1 }, { a: 1 })).toThrow();
  });

  it("assert.strictEqual uses Object.is", () => {
    assert.strictEqual(1, 1);
    assert.strictEqual(NaN, NaN);
    vi(() => assert.strictEqual({}, {})).toThrow();
  });

  it("assert.throws", () => {
    assert.throws(() => {
      throw new TypeError("boom");
    });
    assert.throws(() => {
      throw new TypeError("boom");
    }, TypeError);
    assert.throws(() => {
      throw new Error("boom");
    }, /boom/);
    vi(() => assert.throws(() => {})).toThrow();
  });

  it("thrown errors are AssertionError instances", () => {
    let err: unknown;
    try {
      assert.equal(1, 2);
    } catch (e) {
      err = e;
    }
    vi(err).toBeInstanceOf(AssertionError);
    vi((err as AssertionError).name).toBe("AssertionError");
  });
});
