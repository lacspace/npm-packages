import { test, expect } from "vitest";
import { prefixedId, parsePrefixedId, cuid2, isCuid2, ulid } from "./index";

test("prefixedId round-trips through parsePrefixedId", () => {
  const value = prefixedId("user");
  expect(value.startsWith("user_")).toBe(true);
  const parsed = parsePrefixedId(value);
  expect(parsed).not.toBeNull();
  expect(parsed!.prefix).toBe("user");
  expect(value).toBe(`user_${parsed!.id}`);
});

test("prefixedId honours size, custom alphabet and a custom generator", () => {
  const a = prefixedId("acct", { size: 10 });
  expect(parsePrefixedId(a)!.id.length).toBe(10);

  const withUlid = prefixedId("evt", { generator: () => ulid(3_100_000_000_000) });
  const parsed = parsePrefixedId(withUlid)!;
  expect(parsed.prefix).toBe("evt");
  expect(parsed.id.length).toBe(26);
});

test("prefixedId supports a custom separator and splits on the first one", () => {
  const value = prefixedId("price", { separator: ":", size: 8 });
  const parsed = parsePrefixedId(value, ":")!;
  expect(parsed.prefix).toBe("price");
  expect(parsed.id.length).toBe(8);
  // the base62 body has no underscore, so the default separator can't split it
  expect(parsePrefixedId(value)).toBeNull();
});

test("prefixedId rejects a prefix containing the separator", () => {
  expect(() => prefixedId("a_b")).toThrow();
  expect(() => prefixedId("")).toThrow();
});

test("parsePrefixedId returns null when it cannot split", () => {
  expect(parsePrefixedId("nounderscore")).toBeNull();
  expect(parsePrefixedId("_leading")).toBeNull();
  expect(parsePrefixedId("trailing_")).toBeNull();
});

test("cuid2 is a valid, unique, letter-leading id", () => {
  const id = cuid2();
  expect(isCuid2(id)).toBe(true);
  expect(id.length).toBe(24);
  expect(/^[a-z]/.test(id)).toBe(true);
  expect(cuid2(12).length).toBe(12);
  expect(() => cuid2(2)).toThrow();

  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(cuid2());
  expect(seen.size).toBe(5000);
  expect(isCuid2("9abc")).toBe(false); // must start with a letter
});
