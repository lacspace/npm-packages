import { test, expect } from "vitest";
import { estimateStrength } from "./strength";

test("weak passwords score low, strong ones score high", () => {
  expect(estimateStrength("password").score).toBe(0);
  expect(estimateStrength("123456").score).toBe(0);
  expect(estimateStrength("aaaaaa").score).toBeLessThanOrEqual(1);
  expect(estimateStrength("gT9!qmV2xL@4wZ7pR").score).toBe(4);
});

test("entropy increases with length and variety (ordering)", () => {
  const a = estimateStrength("abc").entropyBits;
  const b = estimateStrength("abcdefgh").entropyBits;
  const c = estimateStrength("aB3$xY9!zQ2#mN7^").entropyBits;
  expect(a).toBeLessThan(b);
  expect(b).toBeLessThan(c);
});

test("detects common, sequence, repeat, keyboard and date patterns", () => {
  expect(estimateStrength("password").patterns).toContain("common");
  expect(estimateStrength("myabc456list").patterns).toEqual(
    expect.arrayContaining(["sequence"]),
  );
  expect(estimateStrength("helloooo").patterns).toContain("repeat");
  expect(estimateStrength("qwertylane").patterns).toContain("keyboard");
  expect(estimateStrength("summer2021ok").patterns).toContain("date");
});

test("returns actionable suggestions for weak input", () => {
  const est = estimateStrength("abc");
  expect(est.suggestions.length).toBeGreaterThan(0);
  expect(est.warnings.length).toBeGreaterThan(0);
});

test("empty password is score 0 with zero entropy", () => {
  const est = estimateStrength("");
  expect(est.score).toBe(0);
  expect(est.entropyBits).toBe(0);
});
