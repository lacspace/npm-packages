import { test, expect } from "vitest";
import { logReturns, cumulativeReturn, beta } from "./performance";

test("logReturns computes ln(pₜ/pₜ₋₁)", () => {
  const r = logReturns([100, 105, 110]);
  expect(r).toHaveLength(2);
  expect(r[0]!).toBeCloseTo(Math.log(105 / 100), 10);
  expect(r[1]!).toBeCloseTo(Math.log(110 / 105), 10);
});

test("logReturns skips non-positive steps", () => {
  expect(logReturns([0, 100])).toEqual([]);
  expect(logReturns([100])).toEqual([]);
});

test("cumulativeReturn compounds geometrically", () => {
  expect(cumulativeReturn([0.1, 0.1])).toBeCloseTo(0.21, 10);
  expect(cumulativeReturn([0.5, -0.5])).toBeCloseTo(-0.25, 10); // 1.5 * 0.5 - 1
  expect(cumulativeReturn([])).toBe(0);
});

test("beta is 2 when the asset moves twice the benchmark", () => {
  const bench = [0.01, 0.02, -0.01, 0.03, -0.02];
  const asset = bench.map((x) => x * 2);
  expect(beta(asset, bench)).toBeCloseTo(2, 10);
});

test("beta is 1 for an identical series and handles degenerate input", () => {
  const bench = [0.01, -0.02, 0.03];
  expect(beta(bench.slice(), bench)).toBeCloseTo(1, 10);
  expect(Number.isNaN(beta([0.01], [0.01]))).toBe(true); // < 2 points
  expect(Number.isNaN(beta([0.01, 0.02], [0.05, 0.05]))).toBe(true); // zero variance
});
