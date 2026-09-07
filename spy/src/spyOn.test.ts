import { describe, it, expect } from "vitest";
import { spyOn, stub, restoreAll } from "./index";

describe("spyOn — methods", () => {
  it("calls through to the original by default and records", () => {
    const calc = { add: (a: number, b: number) => a + b };
    const s = spyOn(calc, "add");
    expect(calc.add(2, 3)).toBe(5);
    expect(s.called).toBe(true);
    expect(s.calledWith(2, 3)).toBe(true);
    s.restore();
  });

  it("can be programmed to override the original", () => {
    const calc = { add: (a: number, b: number) => a + b };
    const s = spyOn(calc, "add").returns(99);
    expect(calc.add(1, 1)).toBe(99);
    s.restore();
    expect(calc.add(1, 1)).toBe(2);
  });

  it("restore puts the original method back", () => {
    const original = (a: number) => a * 2;
    const obj = { double: original };
    const s = spyOn(obj, "double");
    expect(obj.double).not.toBe(original);
    s.restore();
    expect(obj.double).toBe(original);
  });

  it("preserves `this` when calling through", () => {
    const obj = {
      base: 100,
      addBase(this: { base: number }, n: number) {
        return this.base + n;
      },
    };
    spyOn(obj, "addBase");
    expect(obj.addBase(5)).toBe(105);
    restoreAll();
  });

  it("spies on an inherited (prototype) method and restores to inherited", () => {
    class Animal {
      speak() {
        return "generic";
      }
    }
    const a = new Animal();
    expect(Object.prototype.hasOwnProperty.call(a, "speak")).toBe(false);
    const s = spyOn(a, "speak").returns("woof");
    expect(a.speak()).toBe("woof");
    s.restore();
    // After restore the own override is gone and prototype method returns.
    expect(Object.prototype.hasOwnProperty.call(a, "speak")).toBe(false);
    expect(a.speak()).toBe("generic");
  });

  it("throws when the target is not a method", () => {
    const obj = { notAFn: 5 } as unknown as { notAFn: () => void };
    expect(() => spyOn(obj, "notAFn")).toThrow();
  });
});

describe("spyOn — accessors", () => {
  it("spies on a getter and calls through", () => {
    let backing = 7;
    const obj = {
      get value() {
        return backing;
      },
    };
    const s = spyOn(obj, "value", { accessType: "get" });
    expect(obj.value).toBe(7);
    backing = 9;
    expect(obj.value).toBe(9);
    expect(s.callCount).toBe(2);
    s.restore();
    expect(obj.value).toBe(9);
  });

  it("spies on a setter and records the assigned value", () => {
    const seen: number[] = [];
    const obj = {
      set value(v: number) {
        seen.push(v);
      },
    };
    const s = spyOn(obj, "value", { accessType: "set" });
    obj.value = 3;
    obj.value = 4;
    expect(seen).toEqual([3, 4]);
    expect(s.calledWith(3)).toBe(true);
    s.restore();
  });

  it("a programmed getter overrides the accessor", () => {
    const obj = {
      get n() {
        return 1;
      },
    };
    const s = spyOn(obj, "n", { accessType: "get" }).returns(42);
    expect(obj.n).toBe(42);
    s.restore();
    expect(obj.n).toBe(1);
  });

  it("throws when there is no accessor of the requested type", () => {
    const obj = { plain: 1 };
    expect(() => spyOn(obj, "plain", { accessType: "get" })).toThrow();
  });
});

describe("stub", () => {
  it("replaces a method entirely (no call-through)", () => {
    let calledReal = false;
    const obj = {
      work() {
        calledReal = true;
        return "real";
      },
    };
    const s = stub(obj, "work");
    expect(obj.work()).toBeUndefined();
    expect(calledReal).toBe(false);
    expect(s.called).toBe(true);
    s.restore();
    expect(obj.work()).toBe("real");
  });

  it("accepts a fake implementation", () => {
    const obj = { fetch: (_id: number) => "real" };
    const s = stub(obj, "fetch", (id: number) => `fake:${id}`);
    expect(obj.fetch(7)).toBe("fake:7");
    expect(s.calledWith(7)).toBe(true);
    s.restore();
    expect(obj.fetch(7)).toBe("real");
  });
});

describe("restoreAll", () => {
  it("restores every active spyOn and stub", () => {
    const origA = () => "a";
    const origB = () => "b";
    const o1 = { a: origA };
    const o2 = { b: origB };
    spyOn(o1, "a").returns("x");
    stub(o2, "b");
    expect(o1.a()).toBe("x");
    expect(o2.b()).toBeUndefined();
    restoreAll();
    expect(o1.a).toBe(origA);
    expect(o2.b).toBe(origB);
  });

  it("is safe to call when nothing is active", () => {
    expect(() => restoreAll()).not.toThrow();
  });
});
