import { test, expect } from "vitest";
import { uuidv4, uuidv7, uuidv7Time, isUuid, uuidVersion, decodeTime } from "./index";

test("uuidv4 is a well-formed v4 UUID", () => {
  const id = uuidv4();
  expect(isUuid(id)).toBe(true);
  expect(uuidVersion(id)).toBe(4);
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(uuidv4());
  expect(seen.size).toBe(5000);
});

test("uuidv7 is a well-formed v7 UUID and encodes the injected time", () => {
  const T = 1_700_000_000_000;
  const id = uuidv7(T);
  expect(isUuid(id)).toBe(true);
  expect(uuidVersion(id)).toBe(7);
  expect(uuidv7Time(id)).toBe(T);
  expect(decodeTime(id)).toBe(T);
});

test("uuidv7 ids sort lexicographically by creation time", () => {
  const base = 1_700_000_100_000;
  const seq = [base, base + 1, base + 250, base + 9999].map((t) => uuidv7(t));
  const sorted = [...seq].sort();
  expect(sorted).toEqual(seq);
});

test("uuidv7 is monotonic within the same millisecond", () => {
  const T = 1_700_000_200_000;
  const ids = Array.from({ length: 8 }, () => uuidv7(T));
  expect(new Set(ids).size).toBe(8);
  for (let i = 1; i < ids.length; i++) {
    expect(ids[i]! > ids[i - 1]!).toBe(true);
  }
});

test("decodeTime rejects non time-sortable ids", () => {
  expect(() => decodeTime(uuidv4())).toThrow(); // v4 has no timestamp
  expect(() => decodeTime("nope")).toThrow();
});
