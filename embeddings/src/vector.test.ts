import { test, expect } from "vitest";
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  normalize,
  magnitude,
  meanPool,
  topKSimilar,
  VectorError,
} from "./index";

test("dotProduct computes the dot product", () => {
  expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  expect(dotProduct([0, 0], [1, 1])).toBe(0);
});

test("dotProduct throws on length mismatch", () => {
  expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow(VectorError);
});

test("magnitude is the L2 length", () => {
  expect(magnitude([3, 4])).toBe(5);
  expect(magnitude([0, 0, 0])).toBe(0);
});

test("cosineSimilarity of identical vectors is 1", () => {
  expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  expect(cosineSimilarity([2, 4, 6], [1, 2, 3])).toBeCloseTo(1, 10);
});

test("cosineSimilarity of orthogonal vectors is 0", () => {
  expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
});

test("cosineSimilarity of opposite vectors is -1", () => {
  expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
});

test("cosineSimilarity returns 0 (not NaN) for a zero vector", () => {
  expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  expect(Number.isNaN(cosineSimilarity([0, 0], [0, 0]))).toBe(false);
});

test("euclideanDistance measures L2 distance", () => {
  expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
});

test("euclideanDistance throws on length mismatch", () => {
  expect(() => euclideanDistance([1], [1, 2])).toThrow(VectorError);
});

test("normalize returns a unit vector", () => {
  const u = normalize([3, 4]);
  expect(magnitude(u)).toBeCloseTo(1, 10);
  expect(u).toEqual([0.6, 0.8]);
});

test("normalize is safe on a zero vector and does not mutate input", () => {
  const zero = [0, 0, 0];
  const out = normalize(zero);
  expect(out).toEqual([0, 0, 0]);
  expect(out).not.toBe(zero);
});

test("meanPool averages element-wise", () => {
  expect(meanPool([[2, 4], [4, 8]])).toEqual([3, 6]);
  expect(meanPool([[1, 1, 1]])).toEqual([1, 1, 1]);
});

test("meanPool throws on empty input", () => {
  expect(() => meanPool([])).toThrow(VectorError);
});

test("meanPool throws on ragged dimensions", () => {
  expect(() => meanPool([[1, 2], [1, 2, 3]])).toThrow(VectorError);
});

test("topKSimilar returns sorted {index, score} hits", () => {
  const query = [1, 0];
  const candidates = [
    [0, 1], // orthogonal -> 0
    [1, 0], // identical -> 1
    [1, 1], // 45deg -> ~0.707
  ];
  const hits = topKSimilar(query, candidates, 2);
  expect(hits).toHaveLength(2);
  expect(hits[0]?.index).toBe(1);
  expect(hits[0]?.score).toBeCloseTo(1, 10);
  expect(hits[1]?.index).toBe(2);
  expect(hits[1]?.score).toBeCloseTo(Math.SQRT1_2, 10);
});

test("topKSimilar clamps k to the candidate count", () => {
  const hits = topKSimilar([1, 0], [[1, 0], [0, 1]], 10);
  expect(hits).toHaveLength(2);
});

test("topKSimilar with k=0 returns an empty array", () => {
  expect(topKSimilar([1, 0], [[1, 0]], 0)).toEqual([]);
});
