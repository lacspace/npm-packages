import { describe, it, expect } from "vitest";
import { spy, deepEqual } from "./index";

describe("spy — call recording", () => {
  it("records nothing before being called", () => {
    const s = spy();
    expect(s.called).toBe(false);
    expect(s.callCount).toBe(0);
    expect(s.calls).toEqual([]);
    expect(s.firstCall).toBeUndefined();
    expect(s.lastCall).toBeUndefined();
  });

  it("records call count and argument tuples", () => {
    const s = spy();
    s(1, 2);
    s("a");
    expect(s.callCount).toBe(2);
    expect(s.called).toBe(true);
    expect(s.calls).toEqual([[1, 2], ["a"]]);
  });

  it("tracks calledOnce, firstCall and lastCall", () => {
    const s = spy();
    s("first");
    expect(s.calledOnce).toBe(true);
    expect(s.firstCall).toEqual(["first"]);
    expect(s.lastCall).toEqual(["first"]);
    s("second");
    expect(s.calledOnce).toBe(false);
    expect(s.firstCall).toEqual(["first"]);
    expect(s.lastCall).toEqual(["second"]);
  });

  it("delegates to the wrapped impl and preserves the return value", () => {
    const s = spy((a: number, b: number) => a + b);
    expect(s(2, 3)).toBe(5);
    expect(s.calls).toEqual([[2, 3]]);
  });

  it("preserves `this` when wrapping an impl", () => {
    const obj = {
      factor: 10,
      run(this: { factor: number }, x: number) {
        return x * this.factor;
      },
    };
    const s = spy(obj.run);
    expect(s.call({ factor: 3 }, 4)).toBe(12);
  });

  it("records results as return outcomes", () => {
    const s = spy((x: number) => x * 2);
    s(5);
    expect(s.results).toEqual([{ type: "return", value: 10 }]);
  });

  it("records a thrown error as a throw outcome and rethrows", () => {
    const boom = new Error("boom");
    const s = spy(() => {
      throw boom;
    });
    expect(() => s()).toThrow("boom");
    expect(s.results).toEqual([{ type: "throw", value: boom }]);
  });

  it("reset clears history but keeps behaviour", () => {
    const s = spy().returns(7);
    s();
    s();
    expect(s.callCount).toBe(2);
    s.reset();
    expect(s.callCount).toBe(0);
    expect(s.results).toEqual([]);
    expect(s()).toBe(7); // behaviour survived reset
  });

  it("standalone spy .restore is a no-op", () => {
    const s = spy();
    expect(() => s.restore()).not.toThrow();
  });
});

describe("spy — calledWith deep equality", () => {
  it("matches primitive args", () => {
    const s = spy();
    s(1, "two", true);
    expect(s.calledWith(1, "two", true)).toBe(true);
    expect(s.calledWith(1, "two", false)).toBe(false);
  });

  it("deep-matches nested objects and arrays", () => {
    const s = spy();
    s({ a: [1, { b: 2 }] });
    expect(s.calledWith({ a: [1, { b: 2 }] })).toBe(true);
    expect(s.calledWith({ a: [1, { b: 3 }] })).toBe(false);
  });

  it("distinguishes arg count", () => {
    const s = spy();
    s(1);
    expect(s.calledWith(1, 2)).toBe(false);
  });

  it("matches across any recorded call", () => {
    const s = spy();
    s("x");
    s("y");
    expect(s.calledWith("y")).toBe(true);
  });

  it("deepEqual handles NaN, Date, RegExp, Map and Set", () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(new Date(10), new Date(10))).toBe(true);
    expect(deepEqual(new Date(10), new Date(11))).toBe(false);
    expect(deepEqual(/a/gi, /a/gi)).toBe(true);
    expect(deepEqual(/a/g, /a/i)).toBe(false);
    expect(deepEqual(new Map([["k", 1]]), new Map([["k", 1]]))).toBe(true);
    expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
  });

  it("deepEqual treats +0 and -0 as different but survives cycles", () => {
    expect(deepEqual(0, -0)).toBe(false);
    const a: Record<string, unknown> = {};
    a.self = a;
    const b: Record<string, unknown> = {};
    b.self = b;
    expect(deepEqual(a, b)).toBe(true);
  });
});

describe("spy — behaviour programming", () => {
  it("returns a canned value", () => {
    const s = spy().returns(42);
    expect(s()).toBe(42);
    expect(s()).toBe(42);
  });

  it("throws a canned error", () => {
    const s = spy().throws(new Error("nope"));
    expect(() => s()).toThrow("nope");
  });

  it("resolves a promise", async () => {
    const s = spy().resolves("ok");
    await expect(s()).resolves.toBe("ok");
  });

  it("rejects a promise", async () => {
    const s = spy().rejects(new Error("bad"));
    await expect(s()).rejects.toThrow("bad");
  });

  it("callsFake delegates to a replacement", () => {
    const s = spy().callsFake((n: number) => n + 100);
    expect(s(1)).toBe(101);
    expect(s.calledWith(1)).toBe(true);
  });

  it("later behaviour overrides earlier", () => {
    const s = spy().returns(1);
    expect(s()).toBe(1);
    s.returns(2);
    expect(s()).toBe(2);
  });
});

describe("spy — once queues (FIFO)", () => {
  it("returnsOnce consumes in order then falls back to default", () => {
    const s = spy().returns(0);
    s.returnsOnce(1).returnsOnce(2);
    expect(s()).toBe(1);
    expect(s()).toBe(2);
    expect(s()).toBe(0);
    expect(s()).toBe(0);
  });

  it("resolvesOnce queues promise resolutions", async () => {
    const s = spy().resolves("default");
    s.resolvesOnce("a").resolvesOnce("b");
    await expect(s()).resolves.toBe("a");
    await expect(s()).resolves.toBe("b");
    await expect(s()).resolves.toBe("default");
  });

  it("throwsOnce queues a single throw then recovers", () => {
    const s = spy().returns("fine");
    s.throwsOnce(new Error("once"));
    expect(() => s()).toThrow("once");
    expect(s()).toBe("fine");
  });

  it("once queue is independent of default and is consumed first", () => {
    const s = spy().returns("D");
    s.returnsOnce("A");
    expect(s()).toBe("A");
    expect(s()).toBe("D");
  });
});
