import { test, expect } from "vitest";
import {
  ok,
  err,
  some,
  none,
  fromNullable,
  isOk,
  isErr,
  isSome,
  isNone,
  map,
  mapErr,
  andThen,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  match,
  mapOption,
  unwrapOption,
  unwrapOptionOr,
  okOr,
  toNullable,
  trySync,
  tryAsync,
  all,
} from "./index";

/* constructors + guards */

test("ok/err build tagged unions and guards narrow them", () => {
  const a = ok(1);
  const b = err("boom");
  expect(a).toEqual({ ok: true, value: 1 });
  expect(b).toEqual({ ok: false, error: "boom" });
  expect(isOk(a)).toBe(true);
  expect(isErr(a)).toBe(false);
  expect(isOk(b)).toBe(false);
  expect(isErr(b)).toBe(true);
});

test("some/none build tagged unions and guards narrow them", () => {
  const s = some(5);
  expect(s).toEqual({ some: true, value: 5 });
  expect(none).toEqual({ some: false });
  expect(isSome(s)).toBe(true);
  expect(isNone(s)).toBe(false);
  expect(isSome(none)).toBe(false);
  expect(isNone(none)).toBe(true);
});

test("none is a shared constant", () => {
  expect(fromNullable(null)).toBe(none);
});

test("fromNullable maps null/undefined to none, else some", () => {
  expect(fromNullable(null)).toEqual(none);
  expect(fromNullable(undefined)).toEqual(none);
  expect(fromNullable(0)).toEqual({ some: true, value: 0 });
  expect(fromNullable("")).toEqual({ some: true, value: "" });
  expect(fromNullable("x")).toEqual({ some: true, value: "x" });
});

/* result helpers */

test("map transforms Ok, passes Err through", () => {
  expect(map(ok(2), (n) => n + 1)).toEqual(ok(3));
  expect(map(err<string>("x"), (n: number) => n + 1)).toEqual(err("x"));
});

test("mapErr transforms Err, passes Ok through", () => {
  expect(mapErr(err("boom"), (e) => e.toUpperCase())).toEqual(err("BOOM"));
  expect(mapErr(ok(1), (e: string) => e)).toEqual(ok(1));
});

test("andThen chains fallible steps and short-circuits on Err", () => {
  const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err("odd"));
  expect(andThen(ok(8), half)).toEqual(ok(4));
  expect(andThen(ok(7), half)).toEqual(err("odd"));
  expect(andThen(err<string>("pre"), half)).toEqual(err("pre"));
});

test("unwrap returns the value on Ok", () => {
  expect(unwrap(ok(42))).toBe(42);
});

test("unwrap throws the contained Error on Err", () => {
  const e = new Error("nope");
  expect(() => unwrap(err(e))).toThrow(e);
});

test("unwrap wraps a non-Error contained value when throwing", () => {
  expect(() => unwrap(err("plain"))).toThrow("unwrap() called on Err: plain");
});

test("unwrapOr returns fallback on Err", () => {
  expect(unwrapOr(ok(1), 9)).toBe(1);
  expect(unwrapOr(err<string>("x"), 9)).toBe(9);
});

test("unwrapOrElse computes fallback from the error", () => {
  expect(unwrapOrElse(ok(1), () => 0)).toBe(1);
  expect(unwrapOrElse(err(404), (code) => (code === 404 ? -1 : -2))).toBe(-1);
});

test("match folds both arms", () => {
  const handlers = { ok: (n: number) => `ok:${n}`, err: (e: string) => `err:${e}` };
  expect(match(ok(2), handlers)).toBe("ok:2");
  expect(match(err<string>("bad"), handlers)).toBe("err:bad");
});

/* option helpers */

test("mapOption transforms Some, passes None through", () => {
  expect(mapOption(some(2), (n) => n * 10)).toEqual(some(20));
  expect(mapOption(none, (n: number) => n)).toEqual(none);
});

test("unwrapOption returns the value on Some", () => {
  expect(unwrapOption(some("hi"))).toBe("hi");
});

test("unwrapOption throws on None", () => {
  expect(() => unwrapOption(none)).toThrow("unwrapOption() called on None");
});

test("unwrapOptionOr returns fallback on None", () => {
  expect(unwrapOptionOr(some(3), 0)).toBe(3);
  expect(unwrapOptionOr(none, 0)).toBe(0);
});

test("okOr converts Option to Result", () => {
  expect(okOr(some(1), "e")).toEqual(ok(1));
  expect(okOr(none, "missing")).toEqual(err("missing"));
});

test("toNullable converts Option back to a nullable", () => {
  expect(toNullable(some(5))).toBe(5);
  expect(toNullable(none)).toBe(null);
});

/* try helpers */

test("trySync captures a return value as Ok", () => {
  expect(trySync(() => 1 + 1)).toEqual(ok(2));
});

test("trySync captures a thrown Error as Err", () => {
  const r = trySync(() => {
    throw new Error("boom");
  });
  expect(isErr(r)).toBe(true);
  expect(unwrapOr(r, 0)).toBe(0);
  if (isErr(r)) expect(r.error.message).toBe("boom");
});

test("trySync wraps a non-Error throw in an Error", () => {
  const r = trySync(() => {
    throw "stringy";
  });
  expect(isErr(r)).toBe(true);
  if (isErr(r)) {
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error.message).toBe("stringy");
  }
});

test("tryAsync accepts a thunk and resolves to Ok", async () => {
  const r = await tryAsync(async () => 21);
  expect(r).toEqual(ok(21));
});

test("tryAsync accepts a promise directly", async () => {
  const r = await tryAsync(Promise.resolve("ok"));
  expect(r).toEqual(ok("ok"));
});

test("tryAsync captures a rejection as Err", async () => {
  const r = await tryAsync(Promise.reject(new Error("nope")));
  expect(isErr(r)).toBe(true);
  if (isErr(r)) expect(r.error.message).toBe("nope");
});

test("tryAsync wraps a non-Error rejection in an Error", async () => {
  const r = await tryAsync(Promise.reject("bad"));
  expect(isErr(r)).toBe(true);
  if (isErr(r)) {
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error.message).toBe("bad");
  }
});

/* combinators */

test("all collects Ok values in order", () => {
  expect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
  expect(all([] as ReturnType<typeof ok<number>>[])).toEqual(ok([]));
});

test("all short-circuits on the first Err", () => {
  expect(all([ok(1), err("x"), ok(3)])).toEqual(err("x"));
});

/* railway-style integration */

test("composes into a railway pipeline", () => {
  const parse = (s: string) => {
    const n = Number(s);
    return Number.isNaN(n) ? err("not a number") : ok(n);
  };
  const positive = (n: number) => (n > 0 ? ok(n) : err("not positive"));

  const good = andThen(map(parse("10"), (n) => n - 1), positive);
  const bad = andThen(map(parse("nope"), (n) => n - 1), positive);

  expect(good).toEqual(ok(9));
  expect(bad).toEqual(err("not a number"));
});
