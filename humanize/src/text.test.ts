import { test, expect } from "vitest";
import { truncateMiddle, initials, slugcase, ordinal, plural } from "./index";

test("truncateMiddle keeps head + tail within max", () => {
  const out = truncateMiddle("/very/long/path/to/some/file.txt", 20);
  expect(out.length).toBeLessThanOrEqual(20);
  expect(out).toContain("…");
  expect(out.startsWith("/very")).toBe(true);
  expect(out.endsWith("file.txt".slice(-6))).toBe(true);
});

test("truncateMiddle returns short strings untouched", () => {
  expect(truncateMiddle("short", 20)).toBe("short");
});

test("truncateMiddle exact split", () => {
  expect(truncateMiddle("abcdefghij", 5)).toBe("ab…ij");
});

test("initials", () => {
  expect(initials("John Kennedy")).toBe("JK");
  expect(initials("John Fitzgerald Kennedy")).toBe("JK");
  expect(initials("John Fitzgerald Kennedy", { max: 3 })).toBe("JFK");
  expect(initials("madonna")).toBe("M");
  expect(initials("   ")).toBe("");
});

test("slugcase", () => {
  expect(slugcase("Hello, World!")).toBe("hello-world");
  expect(slugcase("  Café del Mar  ")).toBe("cafe-del-mar");
});

test("ordinal locale hook keeps English default", () => {
  expect(ordinal(1)).toBe("1st");
  expect(ordinal(1, { suffixes: { one: "er", other: "e" } })).toBe("1er");
  expect(ordinal(4, { suffixes: { other: "e" } })).toBe("4e");
});

test("plural locale-rule hook keeps English default", () => {
  expect(plural("box", 2)).toBe("boxes");
  expect(plural("ka", 2, undefined, { rule: (w) => `${w}-count` })).toBe("ka-count");
});
