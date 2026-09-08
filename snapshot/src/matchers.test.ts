import { describe, it, expect } from "vitest";
import {
  serializeWithMatchers,
  isMatcher,
  anything,
  any,
  stringMatching,
  stringContaining,
  closeTo,
  arrayContaining,
  objectContaining,
} from "./index";

describe("property matchers — tokens", () => {
  it("isMatcher recognises matcher tokens and nothing else", () => {
    expect(isMatcher(any(String))).toBe(true);
    expect(isMatcher(anything())).toBe(true);
    expect(isMatcher({})).toBe(false);
    expect(isMatcher(null)).toBe(false);
    expect(isMatcher("Any<String>")).toBe(false);
  });

  it("any() matches primitives via typeof", () => {
    expect(any(String).test("x")).toBe(true);
    expect(any(Number).test(1)).toBe(true);
    expect(any(Boolean).test(true)).toBe(true);
    expect(any(String).test(1)).toBe(false);
    expect(any(Number).test(NaN)).toBe(true); // NaN is a number
  });

  it("any() matches instances via instanceof", () => {
    class Foo {}
    expect(any(Foo).test(new Foo())).toBe(true);
    expect(any(Foo).test({})).toBe(false);
    expect(any(Date).test(new Date())).toBe(true);
    expect(any(Object).test({})).toBe(true);
    expect(any(Object).test(null)).toBe(false);
  });

  it("anything() rejects only null and undefined", () => {
    expect(anything().test(0)).toBe(true);
    expect(anything().test("")).toBe(true);
    expect(anything().test(null)).toBe(false);
    expect(anything().test(undefined)).toBe(false);
  });

  it("stringMatching / stringContaining", () => {
    expect(stringMatching(/^ab/).test("abc")).toBe(true);
    expect(stringMatching("cd").test("abcd")).toBe(true);
    expect(stringMatching(/^ab/).test("zab")).toBe(false);
    expect(stringContaining("bc").test("abcd")).toBe(true);
    expect(stringContaining("bc").test("axcd")).toBe(false);
  });

  it("closeTo respects precision", () => {
    expect(closeTo(0.3).test(0.1 + 0.2)).toBe(true);
    expect(closeTo(1, 0).test(1.4)).toBe(true);
    expect(closeTo(1, 0).test(1.6)).toBe(false);
    expect(closeTo(1).test("1" as unknown as number)).toBe(false);
  });

  it("arrayContaining / objectContaining (with nested matchers)", () => {
    expect(arrayContaining([1, any(String)]).test([true, "x", 1])).toBe(true);
    expect(arrayContaining([9]).test([1, 2, 3])).toBe(false);
    expect(objectContaining({ id: any(Number) }).test({ id: 5, name: "a" })).toBe(true);
    expect(objectContaining({ id: any(Number) }).test({ name: "a" })).toBe(false);
  });
});

describe("serializeWithMatchers", () => {
  it("replaces matched volatile fields with stable labels", () => {
    const r = serializeWithMatchers(
      { id: "9f1c-uuid", name: "Ada", createdAt: new Date("2020-01-01T00:00:00.000Z") },
      { id: any(String), createdAt: any(Date) },
    );
    expect(r.pass).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.actual).toBe(
      'Object {\n  "createdAt": Any<Date>,\n  "id": Any<String>,\n  "name": "Ada",\n}',
    );
  });

  it("leaves unmentioned fields serialized exactly as serialize() would", () => {
    const r = serializeWithMatchers({ a: 1, b: 2 }, { a: any(Number) });
    expect(r.actual).toBe('Object {\n  "a": Any<Number>,\n  "b": 2,\n}');
  });

  it("reports a failure and keeps the real value on mismatch", () => {
    const r = serializeWithMatchers({ id: 5 }, { id: any(String) });
    expect(r.pass).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("id: expected Any<String>");
    expect(r.actual).toContain('"id": 5');
  });

  it("descends into nested objects and arrays", () => {
    const r = serializeWithMatchers(
      { user: { id: 7 }, tags: ["a", "b"] },
      { user: { id: any(Number) }, tags: [stringMatching(/a/)] },
    );
    expect(r.pass).toBe(true);
    expect(r.actual).toContain('"id": Any<Number>');
    expect(r.actual).toContain("StringMatching(/a/)");
    expect(r.actual).toContain('"b"'); // untouched index kept
  });

  it("preserves class-instance labels while replacing matched fields", () => {
    class Point {
      constructor(public x: number, public y: number) {}
    }
    const r = serializeWithMatchers(new Point(1, 2), { x: any(Number) });
    expect(r.actual).toBe('Point {\n  "x": Any<Number>,\n  "y": 2,\n}');
  });

  it("a literal in the shape must match strictly", () => {
    const ok = serializeWithMatchers({ v: 1 }, { v: 1 });
    expect(ok.pass).toBe(true);
    const bad = serializeWithMatchers({ v: 1 }, { v: 2 });
    expect(bad.pass).toBe(false);
    expect(bad.errors[0]).toContain("expected 2");
  });
});
