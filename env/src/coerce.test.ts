import { test, expect } from "vitest";
import {
  createEnv,
  port,
  url,
  duration,
  bytes,
  list,
  array,
  enums,
  host,
} from "./index";

test("duration parses units to milliseconds and rejects junk", () => {
  expect(duration().parse("30s", "X")).toBe(30_000);
  expect(duration().parse("5m", "X")).toBe(300_000);
  expect(duration().parse("1h", "X")).toBe(3_600_000);
  expect(duration().parse("500ms", "X")).toBe(500);
  expect(duration().parse("1.5d", "X")).toBe(129_600_000);
  expect(duration().parse("250", "X")).toBe(250); // bare number = ms
  expect(() => duration().parse("soon", "X")).toThrow();
});

test("bytes parses sizes to a byte count and rejects junk", () => {
  expect(bytes().parse("512", "X")).toBe(512);
  expect(bytes().parse("1kb", "X")).toBe(1024);
  expect(bytes().parse("10mb", "X")).toBe(10 * 1024 ** 2);
  expect(bytes().parse("2gb", "X")).toBe(2 * 1024 ** 3);
  expect(bytes().parse("1mib", "X")).toBe(1024 ** 2); // ib alias
  expect(() => bytes().parse("huge", "X")).toThrow();
});

test("list splits comma-separated values, defaulting to strings", () => {
  expect(list().parse("a, b ,c", "X")).toEqual(["a", "b", "c"]);
  expect(list().parse("solo", "X")).toEqual(["solo"]);
});

test("list applies an item validator to each element", () => {
  expect(list(port()).parse("80,443,8080", "X")).toEqual([80, 443, 8080]);
  expect(() => list(port()).parse("80,notaport", "X")).toThrow();
});

test("list honours a custom separator and array is an alias", () => {
  expect(list(undefined, { separator: " " }).parse("a b c", "X")).toEqual(["a", "b", "c"]);
  expect(array).toBe(list);
});

test("enums variadic form accepts members and rejects strangers", () => {
  expect(enums("a", "b", "c").parse("b", "X")).toBe("b");
  expect(() => enums("a", "b").parse("z", "X")).toThrow();
});

test("host accepts hostnames, IPs, localhost and rejects URLs/whitespace", () => {
  expect(host().parse("localhost", "X")).toBe("localhost");
  expect(host().parse("db.internal", "X")).toBe("db.internal");
  expect(host().parse("10.0.0.5", "X")).toBe("10.0.0.5");
  expect(host().parse("db.internal:5432", "X")).toBe("db.internal:5432");
  expect(host().parse("[::1]:6379", "X")).toBe("[::1]:6379");
  expect(() => host().parse("https://db.internal", "X")).toThrow();
  expect(() => host().parse("bad host", "X")).toThrow();
});

test("new coercers respect default and optional", () => {
  const env = createEnv(
    { CACHE_TTL: duration({ default: 60_000 }), MAX_UPLOAD: bytes({ optional: true }) },
    {},
  );
  expect(env.CACHE_TTL).toBe(60_000);
  expect(env.MAX_UPLOAD).toBeUndefined();
});

test("new coercers integrate into createEnv end to end", () => {
  const env = createEnv(
    { TIMEOUT: duration(), HOSTS: list(host()), SIZE: bytes() },
    { TIMEOUT: "2m", HOSTS: "a.com, b.com", SIZE: "1mb" },
  );
  expect(env.TIMEOUT).toBe(120_000);
  expect(env.HOSTS).toEqual(["a.com", "b.com"]);
  expect(env.SIZE).toBe(1024 ** 2);
});
