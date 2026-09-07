import { test, expect } from "vitest";
import { customId, base62Id, base58Id, ALPHABETS, nanoid, shortId } from "./index";

test("customId honours size and only emits alphabet characters", () => {
  const alphabet = ALPHABETS.base58;
  const set = new Set(alphabet);
  for (let i = 0; i < 50; i++) {
    const s = customId({ alphabet, size: 17 });
    expect(s.length).toBe(17);
    for (const ch of s) expect(set.has(ch)).toBe(true);
  }
});

test("customId sampling is unbiased over a non-power-of-two alphabet", () => {
  // 256 % 3 !== 0, so this genuinely exercises rejection sampling.
  const alphabet = "ABC";
  const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
  const draw = customId({ alphabet, size: 9000 });
  for (const ch of draw) counts[ch]!++;
  for (const ch of alphabet) {
    // Expected 3000 each; a wildly generous tolerance (never flaky, still
    // catches a broken/biased sampler which would skew heavily).
    expect(counts[ch]!).toBeGreaterThan(3000 * 0.8);
    expect(counts[ch]!).toBeLessThan(3000 * 1.2);
  }
});

test("customId rejects invalid options", () => {
  expect(() => customId({ alphabet: "A", size: 4 })).toThrow();
  expect(() => customId({ alphabet: ALPHABETS.hex, size: 0 })).toThrow();
  expect(() => customId({ alphabet: ALPHABETS.hex, size: 2.5 })).toThrow();
});

test("base62Id / base58Id honour default and custom sizes", () => {
  expect(base62Id().length).toBe(12);
  expect(base58Id(20).length).toBe(20);
  const b58 = new Set(ALPHABETS.base58);
  for (const ch of base58Id(30)) expect(b58.has(ch)).toBe(true);
});

test("nanoid custom size + uniqueness over many draws", () => {
  expect(nanoid().length).toBe(21);
  expect(nanoid(40).length).toBe(40);
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(nanoid());
  expect(seen.size).toBe(5000);
  expect(shortId(6).length).toBe(6);
});
