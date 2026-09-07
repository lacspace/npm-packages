import { describe, it, expect } from "vitest";
import { roundMinor, DEFAULT_ROUNDING } from "./index";

describe("roundMinor — rounding modes at .5 boundaries", () => {
  it("half-up rounds ties away from zero", () => {
    expect(roundMinor(0.5, "half-up")).toBe(1);
    expect(roundMinor(1.5, "half-up")).toBe(2);
    expect(roundMinor(2.5, "half-up")).toBe(3);
    expect(roundMinor(-0.5, "half-up")).toBe(-1);
    expect(roundMinor(-2.5, "half-up")).toBe(-3);
  });

  it("half-down rounds ties toward zero", () => {
    expect(roundMinor(0.5, "half-down")).toBe(0);
    expect(roundMinor(2.5, "half-down")).toBe(2);
    expect(roundMinor(-0.5, "half-down")).toBe(0);
    expect(roundMinor(-1.5, "half-down")).toBe(-1);
  });

  it("half-even (banker's) rounds ties to the nearest even", () => {
    expect(roundMinor(0.5, "half-even")).toBe(0);
    expect(roundMinor(1.5, "half-even")).toBe(2);
    expect(roundMinor(2.5, "half-even")).toBe(2);
    expect(roundMinor(3.5, "half-even")).toBe(4);
    expect(roundMinor(-2.5, "half-even")).toBe(-2);
  });

  it("half-odd rounds ties to the nearest odd", () => {
    expect(roundMinor(0.5, "half-odd")).toBe(1);
    expect(roundMinor(1.5, "half-odd")).toBe(1);
    expect(roundMinor(2.5, "half-odd")).toBe(3);
  });

  it("half-ceil / half-floor break ties directionally", () => {
    expect(roundMinor(0.5, "half-ceil")).toBe(1);
    expect(roundMinor(-0.5, "half-ceil")).toBe(0);
    expect(roundMinor(0.5, "half-floor")).toBe(0);
    expect(roundMinor(-0.5, "half-floor")).toBe(-1);
  });

  it("ceil / floor / trunc ignore fractions", () => {
    expect(roundMinor(2.1, "ceil")).toBe(3);
    expect(roundMinor(2.9, "floor")).toBe(2);
    expect(roundMinor(-2.9, "trunc")).toBe(-2);
    expect(roundMinor(2.9, "trunc")).toBe(2);
  });

  it("non-tie values round to the nearest regardless of mode", () => {
    expect(roundMinor(2.4, "half-up")).toBe(2);
    expect(roundMinor(2.6, "half-even")).toBe(3);
    expect(roundMinor(2.4, "half-down")).toBe(2);
  });

  it("treats float artefacts near .5 as a clean tie (0.1 * 335)", () => {
    // 335 * 0.1 is 33.499999… in IEEE-754 but should round like a .5 tie.
    expect(roundMinor(335 * 0.1, "half-up")).toBe(34);
    expect(roundMinor(335 * 0.1, "half-even")).toBe(34); // 33 is odd → up to 34
  });

  it("defaults to half-up", () => {
    expect(DEFAULT_ROUNDING).toBe("half-up");
    expect(roundMinor(0.5)).toBe(1);
    expect(roundMinor(-0.5)).toBe(-1);
  });

  it("passes through non-finite values unchanged", () => {
    expect(roundMinor(Infinity, "half-up")).toBe(Infinity);
    expect(Number.isNaN(roundMinor(NaN))).toBe(true);
  });
});
