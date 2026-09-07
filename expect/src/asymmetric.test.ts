import { describe, it, expect as vi } from "vitest";
import { expect } from "./index";

describe("asymmetric matchers", () => {
  it("expect.any", () => {
    expect(5).toEqual(expect.any(Number));
    expect("x").toEqual(expect.any(String));
    expect(new Date()).toEqual(expect.any(Date));
    expect(() => {}).toEqual(expect.any(Function));
    vi(() => expect("x").toEqual(expect.any(Number))).toThrow();
  });

  it("expect.anything", () => {
    expect(0).toEqual(expect.anything());
    expect("").toEqual(expect.anything());
    vi(() => expect(null).toEqual(expect.anything())).toThrow();
    vi(() => expect(undefined).toEqual(expect.anything())).toThrow();
  });

  it("expect.stringContaining / stringMatching", () => {
    expect("hello world").toEqual(expect.stringContaining("world"));
    expect("hello world").toEqual(expect.stringMatching(/^hello/));
    vi(() => expect("abc").toEqual(expect.stringContaining("z"))).toThrow();
  });

  it("expect.arrayContaining", () => {
    expect([1, 2, 3, 4]).toEqual(expect.arrayContaining([2, 4]));
    vi(() => expect([1, 2]).toEqual(expect.arrayContaining([3]))).toThrow();
  });

  it("expect.objectContaining", () => {
    expect({ a: 1, b: 2, c: 3 }).toEqual(expect.objectContaining({ a: 1, c: 3 }));
    vi(() => expect({ a: 1 }).toEqual(expect.objectContaining({ b: 2 }))).toThrow();
  });

  it("expect.closeTo", () => {
    expect(0.1 + 0.2).toEqual(expect.closeTo(0.3));
    vi(() => expect(0.5).toEqual(expect.closeTo(0.3))).toThrow();
  });

  it("nested asymmetric matchers inside toEqual", () => {
    const user = {
      id: 123,
      name: "Ada",
      tags: ["admin", "dev"],
      createdAt: new Date(),
    };
    expect(user).toEqual({
      id: expect.any(Number),
      name: expect.stringMatching(/^A/),
      tags: expect.arrayContaining(["admin"]),
      createdAt: expect.any(Date),
    });
  });

  it("asymmetric matchers work inside toMatchObject", () => {
    expect({ a: 1, meta: { at: 5 } }).toMatchObject({
      a: expect.any(Number),
      meta: expect.objectContaining({ at: 5 }),
    });
  });

  it("expect.not inverts asymmetric matchers", () => {
    expect([1, 2]).toEqual(expect.not.arrayContaining([9]));
    expect("abc").toEqual(expect.not.stringContaining("z"));
    expect({ a: 1 }).toEqual(expect.not.objectContaining({ b: 2 }));
  });
});
