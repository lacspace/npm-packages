import { test, expect } from "vitest";
import { cosine, dot, euclidean, euclideanSimilarity, similarityFor } from "./index";

test("dot product of orthogonal vectors is 0", () => {
  expect(dot([1, 0], [0, 1])).toBe(0);
});

test("dot product accumulates componentwise", () => {
  expect(dot([1, 2, 3], [4, 5, 6])).toBe(1 * 4 + 2 * 5 + 3 * 6);
});

test("cosine of identical direction is 1", () => {
  expect(cosine([2, 0], [5, 0])).toBeCloseTo(1, 10);
});

test("cosine of opposite direction is -1", () => {
  expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
});

test("cosine of orthogonal vectors is 0", () => {
  expect(cosine([1, 0], [0, 3])).toBeCloseTo(0, 10);
});

test("cosine with a zero vector is 0 (no NaN)", () => {
  expect(cosine([0, 0], [1, 2])).toBe(0);
});

test("euclidean distance of identical vectors is 0", () => {
  expect(euclidean([1, 2, 3], [1, 2, 3])).toBe(0);
});

test("euclidean distance is the L2 norm of the difference", () => {
  expect(euclidean([0, 0], [3, 4])).toBe(5);
});

test("euclideanSimilarity is 1 for identical, monotonically lower for farther", () => {
  expect(euclideanSimilarity([0, 0], [0, 0])).toBe(1);
  const near = euclideanSimilarity([0, 0], [1, 0]);
  const far = euclideanSimilarity([0, 0], [10, 0]);
  expect(near).toBeGreaterThan(far);
  expect(far).toBeGreaterThan(0);
});

test("all metrics throw on length mismatch", () => {
  expect(() => dot([1], [1, 2])).toThrow(/mismatch/);
  expect(() => cosine([1], [1, 2])).toThrow(/mismatch/);
  expect(() => euclidean([1], [1, 2])).toThrow(/mismatch/);
});

test("similarityFor selects the right function and is higher-is-better", () => {
  expect(similarityFor("dot")).toBe(dot);
  expect(similarityFor("cosine")).toBe(cosine);
  // euclidean maps to a similarity, not the raw distance
  const simEuclid = similarityFor("euclidean");
  expect(simEuclid([0, 0], [0, 0])).toBe(1);
});
