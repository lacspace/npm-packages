import { test, expect } from "vitest";
import { hash, verify, estimateStrength } from "./index";

// A stored hash is data, not a contract: a corrupted or hostile row must fail
// the login, never crash it. `i=0` reached PBKDF2 and threw "iterations cannot
// be zero"; every other malformed hash already returned false.
test("verify never throws on malformed stored hashes", async () => {
  for (const bad of ["$pbkdf2-sha256$i=0$AAAA$AAAA", "$pbkdf2-sha256$i=-5$AAAA$AAAA", "$pbkdf2-sha256$i=abc$AAAA$AAAA", "$pbkdf2-sha256$i=1000$!!!$AAAA", "$pbkdf2-sha256$i=1000$AAAA$", "", "nope"]) {
    await expect(verify("x", bad)).resolves.toBe(false);
  }
});

// 600,000 PBKDF2 iterations per hash/verify is ~0.9 s each on purpose; under
// full-suite load three of them can pass vitest's 5 s default, so this test
// carries its own budget rather than being weakened.
test("a real hash still verifies, and a wrong password still fails", async () => {
  const h = await hash("correct horse battery staple");
  expect(await verify("correct horse battery staple", h)).toBe(true);
  expect(await verify("correct horse battery stable", h)).toBe(false);
}, 30_000);

// A flat 8-bit penalty let "aaaaaaaaaaaaaaaa" keep 67 bits and score 3 of 4
// while the estimator itself had flagged the repeat.
test("repeated characters and blocks are scored as the trivial passwords they are", () => {
  expect(estimateStrength("aaaaaaaaaaaaaaaa").score).toBeLessThanOrEqual(1);
  expect(estimateStrength("abcabcabcabc").score).toBeLessThanOrEqual(1);
  expect(estimateStrength("zzzzzzzz1!").score).toBeLessThanOrEqual(1);
  expect(estimateStrength("aaaaaaaaaaaaaaaa").patterns).toContain("repeat");
});

test("non-repeating passwords keep their scores", () => {
  expect(estimateStrength("correct horse battery staple").score).toBe(4);
  expect(estimateStrength("Tr0ub4dor&3").score).toBeGreaterThanOrEqual(3);
  expect(estimateStrength("password").score).toBe(0);
});
