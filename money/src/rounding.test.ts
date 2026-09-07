import { test, expect } from "vitest";
import { roundMinor } from "./index";

test("floor / ceil / trunc round in the right direction incl. negatives", () => {
  expect(roundMinor(2.7, "floor")).toBe(2);
  expect(roundMinor(-2.1, "floor")).toBe(-3);
  expect(roundMinor(2.1, "ceil")).toBe(3);
  expect(roundMinor(-2.7, "ceil")).toBe(-2);
  expect(roundMinor(2.9, "trunc")).toBe(2);
  expect(roundMinor(-2.9, "trunc")).toBe(-2);
});

test("half-up rounds .5 away from zero (symmetric)", () => {
  expect(roundMinor(2.5, "half-up")).toBe(3);
  expect(roundMinor(-2.5, "half-up")).toBe(-3);
  expect(roundMinor(0.5)).toBe(1); // default is half-up
});

test("half-down rounds .5 toward zero", () => {
  expect(roundMinor(2.5, "half-down")).toBe(2);
  expect(roundMinor(-2.5, "half-down")).toBe(-2);
  expect(roundMinor(2.6, "half-down")).toBe(3);
});

test("half-even / bankers round .5 to the nearest even integer", () => {
  expect(roundMinor(2.5, "half-even")).toBe(2);
  expect(roundMinor(3.5, "half-even")).toBe(4);
  expect(roundMinor(0.5, "bankers")).toBe(0);
  expect(roundMinor(1.5, "bankers")).toBe(2);
  expect(roundMinor(-2.5, "half-even")).toBe(-2);
  expect(roundMinor(-3.5, "bankers")).toBe(-4);
});

test("non-half fractions round to nearest regardless of mode", () => {
  expect(roundMinor(2.4, "half-even")).toBe(2);
  expect(roundMinor(2.6, "bankers")).toBe(3);
});
