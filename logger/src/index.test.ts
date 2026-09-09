import { test, expect } from "vitest";
import { createLogger, memory, jsonConsole, prettyConsole, toObject, serializeError, LEVELS } from "./index";

const fixedNow = () => 1_700_000_000_000;

test("emits records at or above the active level, drops the rest", () => {
  const mem = memory();
  const log = createLogger({ level: "info", transports: [mem.transport], now: fixedNow });
  log.trace("nope");
  log.debug("nope");
  log.info("yes");
  log.warn("yes");
  log.error("yes");
  expect(mem.records.map((r) => r.level)).toEqual(["info", "warn", "error"]);
  expect(mem.records[0]!.time).toBe(fixedNow());
});

test("record carries msg, level value and merged fields", () => {
  const mem = memory();
  const log = createLogger({ transports: [mem.transport], now: fixedNow });
  log.info("hello", { a: 1, b: "x" });
  const obj = mem.objects()[0]!;
  expect(obj).toEqual({ level: "info", time: fixedNow(), msg: "hello", a: 1, b: "x" });
  expect(mem.records[0]!.levelValue).toBe(LEVELS.info);
});

test("bindings merge into every record; call fields win on conflict", () => {
  const mem = memory();
  const log = createLogger({ bindings: { service: "api", env: "test" }, transports: [mem.transport], now: fixedNow });
  log.info("m", { env: "override", extra: true });
  expect(mem.objects()[0]).toMatchObject({ service: "api", env: "override", extra: true });
});

test("child merges bindings and inherits transports", () => {
  const mem = memory();
  const log = createLogger({ bindings: { service: "api" }, transports: [mem.transport], now: fixedNow });
  const child = log.child({ reqId: "r1" });
  child.info("in-child", { step: 1 });
  expect(mem.objects()[0]).toMatchObject({ service: "api", reqId: "r1", step: 1 });
});

test("level is assignable at runtime and gates immediately", () => {
  const mem = memory();
  const log = createLogger({ level: "warn", transports: [mem.transport], now: fixedNow });
  log.info("hidden");
  expect(mem.records).toHaveLength(0);
  log.level = "debug";
  log.info("now visible");
  expect(mem.records).toHaveLength(1);
  expect(log.isLevelEnabled("debug")).toBe(true);
  expect(log.isLevelEnabled("trace")).toBe(false);
});

test("silent drops everything", () => {
  const mem = memory();
  const log = createLogger({ level: "silent", transports: [mem.transport] });
  log.fatal("still nothing");
  expect(mem.records).toHaveLength(0);
});

test("child level snapshots the parent's level at creation time", () => {
  const mem = memory();
  const log = createLogger({ level: "info", transports: [mem.transport], now: fixedNow });
  const child = log.child({ reqId: "r" });
  child.debug("hidden");
  expect(mem.records).toHaveLength(0);
  child.level = "debug";
  child.debug("shown");
  expect(mem.records).toHaveLength(1);
});

test("Error fields are serialised to plain objects", () => {
  const mem = memory();
  const log = createLogger({ transports: [mem.transport], now: fixedNow });
  log.error("failed", { err: new TypeError("boom") });
  const err = mem.objects()[0]!.err as Record<string, unknown>;
  expect(err.name).toBe("TypeError");
  expect(err.message).toBe("boom");
  expect(typeof err.stack === "string" || err.stack === undefined).toBe(true);
});

test("serializeError exposes name/message/stack", () => {
  const s = serializeError(new Error("x"));
  expect(s.name).toBe("Error");
  expect(s.message).toBe("x");
});

/* ------------------------------ redaction ------------------------------ */

test("redacts dotted paths without mutating the caller's object", () => {
  const mem = memory();
  const log = createLogger({ redact: ["user.token", "password"], transports: [mem.transport], now: fixedNow });
  const payload = { password: "hunter2", user: { name: "a", token: "secret" } };
  log.info("login", payload);
  const obj = mem.objects()[0]!;
  expect(obj.password).toBe("[redacted]");
  expect((obj.user as Record<string, unknown>).token).toBe("[redacted]");
  expect((obj.user as Record<string, unknown>).name).toBe("a");
  // caller's object is untouched
  expect(payload.password).toBe("hunter2");
  expect(payload.user.token).toBe("secret");
});

test("wildcard redaction matches any single segment", () => {
  const mem = memory();
  const log = createLogger({ redact: ["*.secret"], transports: [mem.transport], now: fixedNow });
  log.info("m", { db: { secret: "s1" }, cache: { secret: "s2", host: "h" } });
  const obj = mem.objects()[0]!;
  expect((obj.db as Record<string, unknown>).secret).toBe("[redacted]");
  expect((obj.cache as Record<string, unknown>).secret).toBe("[redacted]");
  expect((obj.cache as Record<string, unknown>).host).toBe("h");
});

test("custom redactText is honoured", () => {
  const mem = memory();
  const log = createLogger({ redact: ["pin"], redactText: "***", transports: [mem.transport], now: fixedNow });
  log.info("m", { pin: 1234 });
  expect(mem.objects()[0]!.pin).toBe("***");
});

/* ------------------------------ transports ------------------------------ */

test("jsonConsole writes one JSON line and routes by severity", () => {
  const lines: Array<[string, string]> = [];
  const out = {
    log: (s: string) => lines.push(["log", s]),
    warn: (s: string) => lines.push(["warn", s]),
    error: (s: string) => lines.push(["error", s]),
  };
  const log = createLogger({ level: "trace", transports: [jsonConsole({ out })], now: fixedNow });
  log.info("i");
  log.warn("w");
  log.error("e");
  expect(lines.map((l) => l[0])).toEqual(["log", "warn", "error"]);
  expect(JSON.parse(lines[0]![1])).toEqual({ level: "info", time: fixedNow(), msg: "i" });
});

test("jsonConsole isoTime emits an ISO timestamp", () => {
  const captured: string[] = [];
  const out = { log: (s: string) => captured.push(s), warn: () => {}, error: () => {} };
  const log = createLogger({ transports: [jsonConsole({ out, isoTime: true })], now: fixedNow });
  log.info("i");
  expect(JSON.parse(captured[0]!).time).toBe(new Date(fixedNow()).toISOString());
});

test("prettyConsole formats a human line with fields", () => {
  const captured: string[] = [];
  const out = { log: (s: string) => captured.push(s), warn: () => {}, error: () => {} };
  const log = createLogger({ transports: [prettyConsole({ out })], now: fixedNow });
  log.info("started", { port: 3000 });
  expect(captured[0]).toBe(`${new Date(fixedNow()).toISOString()} INFO  started port=3000`);
});

test("multiple transports each receive the record", () => {
  const a = memory();
  const b = memory();
  const log = createLogger({ transports: [a.transport, b.transport], now: fixedNow });
  log.info("fan-out");
  expect(a.records).toHaveLength(1);
  expect(b.records).toHaveLength(1);
});

test("memory().clear() empties the buffer", () => {
  const mem = memory();
  const log = createLogger({ transports: [mem.transport] });
  log.info("x");
  expect(mem.records).toHaveLength(1);
  mem.clear();
  expect(mem.records).toHaveLength(0);
});

test("toObject flattens a record", () => {
  const obj = toObject({ level: "warn", levelValue: LEVELS.warn, time: 5, msg: "m", fields: { a: 1 } });
  expect(obj).toEqual({ level: "warn", time: 5, msg: "m", a: 1 });
});
