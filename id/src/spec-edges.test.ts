import { describe, test, expect } from "vitest";
import { uuidv7, uuidv7Time, ulid, isUlid, ulidTime } from "./index";

const sorted = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1]! < x);

describe("UUIDv7 ordering (RFC 9562 §6.2)", () => {
  test("stays sorted past 4096 ids in one millisecond, even with a caller-supplied time", () => {
    const now = Date.UTC(2026, 8, 25);
    const ids = Array.from({ length: 10_000 }, () => uuidv7(now));
    expect(new Set(ids).size).toBe(10_000);
    expect(sorted(ids)).toBe(true);
  });

  test("stays sorted when the clock steps backwards", () => {
    const t = Date.UTC(2026, 8, 25, 12);
    const a = uuidv7(t);
    const b = uuidv7(t - 5_000); // NTP correction
    expect(b > a).toBe(true);
    expect(uuidv7Time(b)).toBe(t);
  });

  test("rejects times that don't fit 48 bits", () => {
    for (const bad of [-1, 2 ** 48, Number.NaN, Infinity]) expect(() => uuidv7(bad)).toThrow(RangeError);
    expect(uuidv7Time(uuidv7(2 ** 48 - 1))).toBe(2 ** 48 - 1);
  });
});

describe("ULID bounds (spec: reject anything past 7ZZZZZZZZZ)", () => {
  test("throws instead of emitting an id isUlid rejects", () => {
    for (const bad of [-1, 2 ** 48, Number.NaN]) expect(() => ulid(bad)).toThrow(RangeError);
  });

  test("the largest time still encodes and decodes", () => {
    const id = ulid(2 ** 48 - 1);
    expect(id.startsWith("7ZZZZZZZZZ")).toBe(true);
    expect(isUlid(id)).toBe(true);
    expect(ulidTime(id)).toBe(2 ** 48 - 1);
  });
});
