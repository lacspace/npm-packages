import { describe, it, expect as vi } from "vitest";
import { equals } from "./index";

describe("deep-equality engine", () => {
  it("primitives, NaN and +0/-0", () => {
    vi(equals(1, 1)).toBe(true);
    vi(equals(NaN, NaN)).toBe(true);
    vi(equals(0, -0)).toBe(true); // loose: equal
    vi(equals("a", "b")).toBe(false);
    vi(equals(1n, 1n)).toBe(true);
    vi(equals(null, undefined)).toBe(false);
  });

  it("arrays and nested objects", () => {
    vi(equals([1, [2, [3]]], [1, [2, [3]]])).toBe(true);
    vi(equals([1, 2], [1, 2, 3])).toBe(false);
    vi(equals({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    vi(equals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("Date and RegExp", () => {
    vi(equals(new Date(0), new Date(0))).toBe(true);
    vi(equals(new Date(0), new Date(1))).toBe(false);
    vi(equals(new Date("invalid"), new Date("invalid"))).toBe(true);
    vi(equals(/ab/gi, /ab/gi)).toBe(true);
    vi(equals(/ab/g, /ab/i)).toBe(false);
  });

  it("Map equality (order-independent)", () => {
    const a = new Map([["x", 1], ["y", 2]]);
    const b = new Map([["y", 2], ["x", 1]]);
    vi(equals(a, b)).toBe(true);
    vi(equals(a, new Map([["x", 1]]))).toBe(false);
  });

  it("Map with object keys", () => {
    const a = new Map<object, number>([[{ id: 1 }, 10]]);
    const b = new Map<object, number>([[{ id: 1 }, 10]]);
    vi(equals(a, b)).toBe(true);
  });

  it("Set equality", () => {
    vi(equals(new Set([1, 2, 3]), new Set([3, 2, 1]))).toBe(true);
    vi(equals(new Set([{ a: 1 }]), new Set([{ a: 1 }]))).toBe(true);
    vi(equals(new Set([1]), new Set([1, 2]))).toBe(false);
  });

  it("typed arrays and ArrayBuffer", () => {
    vi(equals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    vi(equals(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    vi(equals(new Int16Array([1]), new Uint16Array([1]))).toBe(false); // different tag
    const buf1 = new Uint8Array([9, 8]).buffer;
    const buf2 = new Uint8Array([9, 8]).buffer;
    vi(equals(buf1, buf2)).toBe(true);
  });

  it("boxed primitives", () => {
    vi(equals(new Number(5), new Number(5))).toBe(true);
    vi(equals(new String("hi"), new String("hi"))).toBe(true);
  });

  it("handles circular references without stack overflow", () => {
    const a: any = { name: "a" };
    a.self = a;
    const b: any = { name: "a" };
    b.self = b;
    vi(equals(a, b)).toBe(true);

    const c: any = { name: "a" };
    c.self = c;
    const d: any = { name: "different" };
    d.self = d;
    vi(equals(c, d)).toBe(false);
  });

  it("mutually recursive structures", () => {
    const a1: any = {};
    const a2: any = { back: a1 };
    a1.fwd = a2;
    const b1: any = {};
    const b2: any = { back: b1 };
    b1.fwd = b2;
    vi(equals(a1, b1)).toBe(true);
  });

  it("strict mode distinguishes sparse arrays", () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [, 1];
    const dense = [undefined, 1];
    vi(equals(sparse, dense, false)).toBe(true);
    vi(equals(sparse, dense, true)).toBe(false);
  });

  it("symbol keys are compared", () => {
    const s = Symbol.for("k");
    vi(equals({ [s]: 1 }, { [s]: 1 })).toBe(true);
    vi(equals({ [s]: 1 }, { [s]: 2 })).toBe(false);
  });
});
