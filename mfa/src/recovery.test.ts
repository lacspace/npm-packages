import { test, expect } from "vitest";
import {
  generateRecoveryCodes,
  verifyRecoveryCode,
  consumeRecoveryCode,
  recoveryCodeFactorType,
} from "./index";

test("generates the requested number of codes + matching hashes", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 8, length: 10, groupSize: 5 });
  expect(codes).toHaveLength(8);
  expect(hashes).toHaveLength(8);
  // grouped "abcde-fghij"
  expect(codes[0]).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
  // hashes store salt$digest, never the plaintext
  for (const h of hashes) expect(h).toMatch(/^[0-9a-f]+\$[0-9a-f]{64}$/);
  for (let i = 0; i < codes.length; i++) expect(h_contains_plain(hashes[i]!, codes[i]!)).toBe(false);
});

function h_contains_plain(hash: string, code: string): boolean {
  return hash.includes(code.replace(/-/g, ""));
}

test("verifyRecoveryCode matches the right index, ignoring separators/case", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 5 });
  expect(await verifyRecoveryCode(codes[2]!, hashes)).toBe(2);
  // formatting-insensitive
  expect(await verifyRecoveryCode(codes[2]!.toUpperCase().replace(/-/g, ""), hashes)).toBe(2);
  // a non-code
  expect(await verifyRecoveryCode("not-a-real-code", hashes)).toBe(-1);
});

test("consumeRecoveryCode removes the used code (single use)", async () => {
  const { codes, hashes } = await generateRecoveryCodes({ count: 4 });
  const first = await consumeRecoveryCode(codes[1]!, hashes);
  expect(first.consumed).toBe(true);
  expect(first.index).toBe(1);
  expect(first.remaining).toHaveLength(3);
  // the same code no longer works against the remaining set
  expect(await verifyRecoveryCode(codes[1]!, first.remaining)).toBe(-1);
  // a miss leaves the set intact
  const miss = await consumeRecoveryCode("wrong", first.remaining);
  expect(miss.consumed).toBe(false);
  expect(miss.remaining).toHaveLength(3);
});

test("injected RNG makes generation deterministic", async () => {
  const seq = (n: number) => new Uint8Array(n).fill(0); // always byte 0
  const a = await generateRecoveryCodes({ count: 2, length: 6, groupSize: 0, random: seq });
  const b = await generateRecoveryCodes({ count: 2, length: 6, groupSize: 0, random: seq });
  expect(a.codes).toEqual(b.codes);
  expect(a.codes[0]!).toBe("aaaaaa"); // alphabet[0] repeated
});

test("recovery codes are modelled as a possession factor", () => {
  expect(recoveryCodeFactorType).toBe("possession");
});
