import { test, expect } from "vitest";
import {
  parse, toHex,
  NAMED_COLORS, namedColorHex,
  toHsvObject, hsvToRgb, toHsv,
  rgbToOklab, oklabToRgb, rgbToOklch, oklchToRgb, toOklch,
  invert, complement, mixOklab,
  contrastRatio, wcagLevel, bestTextColor,
  tints, shades, scale,
  complementary, analogous, triadic, tetradic, splitComplementary, harmony,
} from "./index";

/* -------------------------------- parsing -------------------------------- */

test("parse resolves CSS named colours", () => {
  expect(parse("red")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  expect(parse("rebeccapurple")).toEqual({ r: 0x66, g: 0x33, b: 0x99, a: 1 });
  expect(parse("  White ")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  expect(parse("transparent").a).toBe(0);
  expect(namedColorHex("dodgerblue")).toBe("#1e90ff");
  expect(namedColorHex("not-a-real-color")).toBeUndefined();
  expect(Object.keys(NAMED_COLORS).length).toBeGreaterThan(140);
});

test("parse still supports every legacy format", () => {
  expect(parse("#0f08")).toMatchObject({ r: 0, g: 255, b: 0 });
  expect(parse("rgb(1,2,3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  expect(parse("rgba(1,2,3,0.5)").a).toBe(0.5);
  expect(toHex(parse("hsl(0, 100%, 50%)"))).toBe("#ff0000");
});

/* --------------------------------- HSV/HSB --------------------------------- */

test("RGB -> HSV for known colours", () => {
  expect(toHsvObject("#ff0000")).toMatchObject({ h: 0, s: 100, v: 100 });
  expect(toHsvObject("#000000")).toMatchObject({ h: 0, s: 0, v: 0 });
  expect(toHsvObject("#ffffff")).toMatchObject({ h: 0, s: 0, v: 100 });
  expect(toHsv("#00ff00")).toBe("hsv(120, 100%, 100%)");
});

test("RGB <-> HSV round-trips within tolerance", () => {
  for (const hex of ["#2563eb", "#f4a460", "#123456", "#abcdef", "#7fff00"]) {
    const rt = hsvToRgb(toHsvObject(hex));
    const src = parse(hex);
    expect(Math.abs(rt.r - src.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(rt.g - src.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(rt.b - src.b)).toBeLessThanOrEqual(1);
  }
});

/* --------------------------------- OKLab/OKLCH --------------------------------- */

test("OKLab white/black anchors are sane", () => {
  expect(rgbToOklab("#ffffff").L).toBeCloseTo(1, 2);
  expect(rgbToOklab("#000000").L).toBeCloseTo(0, 2);
});

test("RGB <-> OKLab round-trips within tolerance", () => {
  for (const hex of ["#2563eb", "#ff0000", "#00ff00", "#0000ff", "#808080", "#f4a460"]) {
    const rt = oklabToRgb(rgbToOklab(hex));
    const src = parse(hex);
    expect(Math.abs(rt.r - src.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(rt.g - src.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(rt.b - src.b)).toBeLessThanOrEqual(1);
  }
});

test("RGB <-> OKLCH round-trips and formats", () => {
  const rt = oklchToRgb(rgbToOklch("#2563eb"));
  const src = parse("#2563eb");
  expect(Math.abs(rt.r - src.r)).toBeLessThanOrEqual(1);
  expect(Math.abs(rt.g - src.g)).toBeLessThanOrEqual(1);
  expect(Math.abs(rt.b - src.b)).toBeLessThanOrEqual(1);
  expect(toOklch("#ff0000")).toMatch(/^oklch\(/);
  expect(toOklch("rgba(255,0,0,0.5)")).toContain("/ 0.5");
});

/* --------------------------------- manipulation --------------------------------- */

test("invert and complement", () => {
  expect(invert("#000000")).toBe("#ffffff");
  expect(invert("#ffffff")).toBe("#000000");
  expect(invert("#123456")).toBe("#edcba9");
  // complement of red is cyan-ish (hue 180)
  expect(complement("#ff0000")).toBe("#00ffff");
});

test("mixOklab midpoint sits between the two colours", () => {
  const mid = mixOklab("#000000", "#ffffff");
  const { r } = parse(mid);
  // OKLab midpoint of black/white is a perceptual mid-grey (~#636363)
  expect(r).toBeGreaterThan(60);
  expect(r).toBeLessThan(160);
  // pure endpoints
  expect(mixOklab("#ff0000", "#0000ff", 0)).toBe("#ff0000");
  expect(mixOklab("#ff0000", "#0000ff", 1)).toBe("#0000ff");
});

/* --------------------------------- accessibility --------------------------------- */

test("contrastRatio matches known pairs", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
});

test("wcagLevel thresholds (normal + large)", () => {
  expect(wcagLevel(21)).toBe("AAA");
  expect(wcagLevel(7)).toBe("AAA");
  expect(wcagLevel(4.5)).toBe("AA");
  expect(wcagLevel(4.49)).toBe("fail");
  expect(wcagLevel(3)).toBe("fail");
  // large text is more lenient
  expect(wcagLevel(4.5, { large: true })).toBe("AAA");
  expect(wcagLevel(3, { large: true })).toBe("AA");
  expect(wcagLevel(2.9, { large: true })).toBe("fail");
});

test("bestTextColor on light and dark backgrounds", () => {
  expect(bestTextColor("#ffffff")).toBe("#000000");
  expect(bestTextColor("#000000")).toBe("#ffffff");
  // dodgerblue is light enough that black text has the higher contrast
  expect(bestTextColor("#1e90ff")).toBe("#000000");
  // custom candidate set
  expect(bestTextColor("#ffffff", ["#333333", "#eeeeee"])).toBe("#333333");
  expect(() => bestTextColor("#fff", [])).toThrow();
});

/* --------------------------------- palettes --------------------------------- */

test("tints get lighter, shades get darker", () => {
  const t = tints("#2563eb", 4);
  const sh = shades("#2563eb", 4);
  expect(t).toHaveLength(4);
  expect(sh).toHaveLength(4);
  const L = (hex: string) => parse(hex).r + parse(hex).g + parse(hex).b;
  // last tint lighter than first tint; last shade darker than first shade
  expect(L(t[3]!)).toBeGreaterThan(L(t[0]!));
  expect(L(sh[3]!)).toBeLessThan(L(sh[0]!));
});

test("scale spans light to dark with base-length control", () => {
  const s = scale("#2563eb", 9);
  expect(s).toHaveLength(9);
  const sum = (hex: string) => parse(hex).r + parse(hex).g + parse(hex).b;
  expect(sum(s[0]!)).toBeGreaterThan(sum(s[8]!)); // first lighter than last
});

test("harmony sets produce the right counts", () => {
  expect(complementary("#ff0000")).toEqual(["#ff0000", "#00ffff"]);
  expect(triadic("#ff0000")).toHaveLength(3);
  expect(tetradic("#ff0000")).toHaveLength(4);
  expect(analogous("#ff0000", 30, 5)).toHaveLength(5);
  expect(splitComplementary("#ff0000")).toHaveLength(3);
  expect(harmony("#ff0000", "triadic")).toEqual(triadic("#ff0000"));
  expect(harmony("#ff0000", "analogous")).toEqual(analogous("#ff0000"));
});
