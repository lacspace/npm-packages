import { test, expect } from "vitest";
import { parse, toHex, toRgb, toHslObject, toHsl, hslToRgb, contrast } from "./index";

test("hex -> rgb for known colors", () => {
  expect(parse("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  expect(parse("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  expect(parse("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  // shorthand expands
  expect(parse("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
});

test("rgb -> hex round-trips", () => {
  expect(toHex({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000");
  expect(toHex("#abc")).toBe("#aabbcc");
  expect(toRgb("#ff0000")).toBe("rgb(255, 0, 0)");
});

test("rgb -> hsl for known colors", () => {
  expect(toHslObject("#ff0000")).toMatchObject({ h: 0, s: 100, l: 50 });
  expect(toHsl("#ff0000")).toBe("hsl(0, 100%, 50%)");
});

test("hsl -> rgb for known colors", () => {
  expect(hslToRgb({ h: 0, s: 100, l: 50, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  expect(hslToRgb({ h: 120, s: 100, l: 50, a: 1 })).toEqual({ r: 0, g: 255, b: 0, a: 1 });
});

test("contrast(black, white) === 21", () => {
  expect(contrast("#000000", "#ffffff")).toBe(21);
});

test("invalid input throws rather than producing NaN", () => {
  expect(() => parse("#gg0000")).toThrow();
  expect(() => parse("#12345")).toThrow(); // wrong length
  expect(() => parse("rgb(a, b, c)")).toThrow();
  expect(() => parse("not-a-color")).toThrow();
});
