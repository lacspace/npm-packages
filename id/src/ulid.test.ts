import { test, expect } from "vitest";
import { ulid, isUlid, ulidTime, decodeTime } from "./index";

// All injected times start well in the future so the module-level monotonic
// clock is never "clamped" by a real Date.now() from another call.

test("ulid is monotonic and time-sortable within the same millisecond", () => {
  const T = 3_000_000_000_000;
  const ids = Array.from({ length: 6 }, () => ulid(T));
  expect(new Set(ids).size).toBe(6); // all unique
  for (let i = 1; i < ids.length; i++) {
    expect(ids[i]! > ids[i - 1]!).toBe(true); // strictly increasing
  }
  for (const x of ids) {
    expect(isUlid(x)).toBe(true);
    expect(x.length).toBe(26);
    expect(ulidTime(x)).toBe(T); // same embedded timestamp
  }
});

test("ulids sort lexicographically by creation time across milliseconds", () => {
  const base = 3_000_000_100_000;
  const times = [base, base + 1, base + 5, base + 1000, base + 999999];
  const seq = times.map((t) => ulid(t));
  const sorted = [...seq].sort();
  expect(sorted).toEqual(seq);
});

test("decodeTime / ulidTime recover the injected timestamp", () => {
  // Must exceed every timestamp injected by earlier tests (module-level clock).
  const T = 3_000_002_000_000;
  const id = ulid(T);
  expect(ulidTime(id)).toBe(T);
  expect(decodeTime(id)).toBe(T);
});

test("ulid stays monotonic even if the clock goes backwards", () => {
  const a = ulid(3_000_003_000_000);
  const b = ulid(3_000_002_999_000); // earlier clock reading
  expect(b > a).toBe(true);
});

test("isUlid rejects malformed values", () => {
  expect(isUlid(ulid(3_000_004_000_000))).toBe(true);
  expect(isUlid("not-a-ulid")).toBe(false);
  expect(isUlid("")).toBe(false);
  expect(isUlid("0000000000000000000000000I")).toBe(false); // I is not in Crockford
});
