import { test, expect } from "vitest";
import { bytes, duration, ordinal, relativeTime, list, number } from "./index";

test("bytes", () => {
  expect(bytes(500)).toBe("500 B");
  expect(bytes(1536)).toBe("1.5 KB");
  expect(bytes(1048576, { binary: true })).toBe("1.0 MiB");
});

test("duration", () => {
  expect(duration(90061000)).toBe("1d 1h");
  expect(duration(0)).toBe("0s");
  expect(duration(61000, { long: true })).toBe("1 minute 1 second");
});

test("ordinal", () => {
  expect(ordinal(1)).toBe("1st");
  expect(ordinal(2)).toBe("2nd");
  expect(ordinal(3)).toBe("3rd");
  expect(ordinal(11)).toBe("11th");
  expect(ordinal(21)).toBe("21st");
});

test("relativeTime buckets", () => {
  const base = 1_000_000_000_000;
  expect(relativeTime(base - 3600 * 1000, base)).toBe("1 hour ago");
  expect(relativeTime(base - 2 * 86400 * 1000, base)).toBe("2 days ago");
  expect(relativeTime(base + 3600 * 1000, base)).toBe("in 1 hour");
  expect(relativeTime(base, base)).toBe("just now");
});

test("list oxford", () => {
  expect(list(["a", "b", "c"])).toBe("a, b and c");
  expect(list(["a", "b", "c"], { oxford: true })).toBe("a, b, and c");
});

test("number(1e21) does not corrupt (no 'e')", () => {
  const out = number(1e21);
  expect(out).not.toMatch(/e/i);
  expect(out).toBe("1,000,000,000,000,000,000,000");
});

test("number(1e-7) does not corrupt (no 'e', correct digits)", () => {
  const out = number(1e-7);
  expect(out).not.toMatch(/e/i);
  expect(out).toBe("0.0000001");
});
