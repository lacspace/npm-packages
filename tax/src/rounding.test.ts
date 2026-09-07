import { test, expect } from "vitest";
import { roundMinor } from "./index";

test("roundMinor: half-up rounds .5 away from zero", () => {
  expect(roundMinor(2.5, "half-up")).toBe(3);
  expect(roundMinor(-2.5, "half-up")).toBe(-3);
  expect(roundMinor(2.4, "half-up")).toBe(2);
});

test("roundMinor: half-down rounds .5 toward zero", () => {
  expect(roundMinor(2.5, "half-down")).toBe(2);
  expect(roundMinor(-2.5, "half-down")).toBe(-2);
  expect(roundMinor(2.6, "half-down")).toBe(3);
});

test("roundMinor: half-even / bankers agree and round .5 to even", () => {
  for (const mode of ["half-even", "bankers"] as const) {
    expect(roundMinor(2.5, mode)).toBe(2);
    expect(roundMinor(3.5, mode)).toBe(4);
    expect(roundMinor(-2.5, mode)).toBe(-2);
    expect(roundMinor(-3.5, mode)).toBe(-4);
  }
});

test("roundMinor: ceil / floor / trunc directions", () => {
  expect(roundMinor(2.1, "ceil")).toBe(3);
  expect(roundMinor(-2.1, "ceil")).toBe(-2);
  expect(roundMinor(2.9, "floor")).toBe(2);
  expect(roundMinor(-2.1, "floor")).toBe(-3);
  expect(roundMinor(2.9, "trunc")).toBe(2);
  expect(roundMinor(-2.9, "trunc")).toBe(-2);
});

test("roundMinor: none keeps the exact fraction and defaults to half-up", () => {
  expect(roundMinor(2.5, "none")).toBe(2.5);
  expect(roundMinor(2.5)).toBe(3);
});
