/**
 * @lacspace/result
 *
 * Typed, functional error handling for TypeScript. Instead of throwing,
 * functions return a `Result<T, E>` (an `Ok` or an `Err`) or an `Option<T>`
 * (a `Some` or a `None`), so failure and absence become values the type
 * checker forces you to handle. Zero dependencies, isomorphic, and fully
 * tree-shakeable: everything is a plain-object tagged union plus standalone
 * helper functions — no classes, no prototypes, no magic.
 *
 * @example
 * import { ok, err, map, unwrapOr, trySync } from "@lacspace/result";
 *
 * function parse(s: string) {
 *   const n = Number(s);
 *   return Number.isNaN(n) ? err(new Error("not a number")) : ok(n);
 * }
 *
 * const doubled = map(parse("21"), (n) => n * 2); // Ok(42)
 * unwrapOr(parse("nope"), 0);                      // 0
 *
 * const safe = trySync(() => JSON.parse('{"a":1}')); // Ok({ a: 1 })
 */

/* ------------------------------ types ------------------------------ */

/** The success arm of a {@link Result}. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** The failure arm of a {@link Result}. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A value that is either a success (`Ok<T>`) or a failure (`Err<E>`).
 * Discriminate on the `ok` field, or use the guards / helpers below.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** The present arm of an {@link Option}. */
export interface Some<T> {
  readonly some: true;
  readonly value: T;
}

/** The absent arm of an {@link Option}. */
export interface None {
  readonly some: false;
}

/**
 * A value that is either present (`Some<T>`) or absent (`None`).
 * Discriminate on the `some` field, or use the guards / helpers below.
 */
export type Option<T> = Some<T> | None;

/* --------------------------- constructors --------------------------- */

/**
 * Build a successful {@link Result}.
 *
 * @example
 * ok(42); // { ok: true, value: 42 }
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Build a failed {@link Result}.
 *
 * @example
 * err(new Error("boom")); // { ok: false, error: Error }
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Build a present {@link Option}.
 *
 * @example
 * some("hi"); // { some: true, value: "hi" }
 */
export function some<T>(value: T): Some<T> {
  return { some: true, value };
}

/** The single absent {@link Option} value. A shared constant. */
export const none: None = { some: false };

/**
 * Wrap a possibly-nullish value: `null`/`undefined` become {@link none},
 * anything else becomes {@link some}.
 *
 * @example
 * fromNullable(process.env.PORT); // Some(...) or None
 */
export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value === null || value === undefined ? none : some(value);
}

/* ------------------------------ guards ------------------------------ */

/** Narrow a {@link Result} to its `Ok` arm. */
export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

/** Narrow a {@link Result} to its `Err` arm. */
export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

/** Narrow an {@link Option} to its `Some` arm. */
export function isSome<T>(o: Option<T>): o is Some<T> {
  return o.some;
}

/** Narrow an {@link Option} to its `None` arm. */
export function isNone<T>(o: Option<T>): o is None {
  return !o.some;
}

/* -------------------------- result helpers -------------------------- */

/**
 * Transform the success value, leaving an `Err` untouched.
 *
 * @example
 * map(ok(2), (n) => n + 1); // Ok(3)
 * map(err("x"), (n) => n);  // Err("x")
 */
export function map<T, E, U>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/**
 * Transform the error, leaving an `Ok` untouched.
 *
 * @example
 * mapErr(err("boom"), (e) => new Error(e)); // Err(Error)
 */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/**
 * Chain a fallible step (`flatMap`): `fn` itself returns a `Result`, so
 * errors short-circuit and successes flow onward.
 *
 * @example
 * andThen(ok(4), (n) => n > 0 ? ok(Math.sqrt(n)) : err("neg")); // Ok(2)
 */
export function andThen<T, E, U, F>(
  r: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return r.ok ? fn(r.value) : r;
}

/**
 * Return the success value, or **throw** the error. Use only when you have
 * proven the `Result` is `Ok`; prefer {@link unwrapOr} / {@link match} otherwise.
 *
 * @throws the contained error (as-is if it is a thrown-able, else wrapped).
 * @example
 * unwrap(ok(1)); // 1
 * unwrap(err(new Error("no"))); // throws Error("no")
 */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error
    ? r.error
    : new Error(`unwrap() called on Err: ${String(r.error)}`);
}

/**
 * Return the success value, or `fallback` if it is an `Err`.
 *
 * @example
 * unwrapOr(err("x"), 0); // 0
 */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/**
 * Return the success value, or compute a fallback from the error.
 *
 * @example
 * unwrapOrElse(err(404), (code) => code === 404 ? "missing" : "other");
 */
export function unwrapOrElse<T, E>(r: Result<T, E>, fn: (error: E) => T): T {
  return r.ok ? r.value : fn(r.error);
}

/**
 * Exhaustively fold a {@link Result} into a single value by supplying a
 * handler for each arm. Returns whatever the matching branch returns.
 *
 * @example
 * match(ok(2), { ok: (n) => `got ${n}`, err: (e) => `fail ${e}` }); // "got 2"
 */
export function match<T, E, R>(
  r: Result<T, E>,
  handlers: { ok: (value: T) => R; err: (error: E) => R },
): R {
  return r.ok ? handlers.ok(r.value) : handlers.err(r.error);
}

/* -------------------------- option helpers -------------------------- */

/**
 * Transform the value inside a `Some`, leaving `None` untouched.
 *
 * @example
 * mapOption(some(2), (n) => n * 10); // Some(20)
 * mapOption(none, (n) => n);         // None
 */
export function mapOption<T, U>(o: Option<T>, fn: (value: T) => U): Option<U> {
  return o.some ? some(fn(o.value)) : none;
}

/**
 * Return the contained value, or **throw** if the option is `None`.
 *
 * @throws Error when the option is `None`.
 * @example
 * unwrapOption(some(1)); // 1
 */
export function unwrapOption<T>(o: Option<T>): T {
  if (o.some) return o.value;
  throw new Error("unwrapOption() called on None");
}

/**
 * Return the contained value, or `fallback` if the option is `None`.
 *
 * @example
 * unwrapOptionOr(none, "default"); // "default"
 */
export function unwrapOptionOr<T>(o: Option<T>, fallback: T): T {
  return o.some ? o.value : fallback;
}

/**
 * Convert an {@link Option} to a {@link Result}: `Some` → `Ok`, `None` → `Err(error)`.
 *
 * @example
 * okOr(fromNullable(user), new Error("no user")); // Ok(user) | Err(Error)
 */
export function okOr<T, E>(o: Option<T>, error: E): Result<T, E> {
  return o.some ? ok(o.value) : err(error);
}

/**
 * Convert an {@link Option} back to a nullable: `Some` → the value, `None` → `null`.
 *
 * @example
 * toNullable(some(5)); // 5
 * toNullable(none);    // null
 */
export function toNullable<T>(o: Option<T>): T | null {
  return o.some ? o.value : null;
}

/* --------------------------- try helpers --------------------------- */

/** Coerce an unknown thrown value into an `Error`. */
function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Run a synchronous function, capturing any thrown value as an `Err`.
 * Non-`Error` throws are wrapped in an `Error`.
 *
 * @example
 * trySync(() => JSON.parse(input)); // Ok(value) | Err(Error)
 */
export function trySync<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(toError(e));
  }
}

/**
 * Await a promise (or a function returning one), capturing rejection as an
 * `Err`. Accepts either a thunk or a promise directly.
 *
 * @example
 * await tryAsync(() => fetch(url));      // from a thunk
 * await tryAsync(fetch(url));            // from a promise
 */
export async function tryAsync<T>(
  fn: (() => Promise<T>) | Promise<T>,
): Promise<Result<T, Error>> {
  try {
    const value = await (typeof fn === "function" ? fn() : fn);
    return ok(value);
  } catch (e) {
    return err(toError(e));
  }
}

/* ---------------------------- combinators --------------------------- */

/**
 * Collect an array of results into a single result of an array. The first
 * `Err` short-circuits and is returned; otherwise an `Ok` of every value in
 * order.
 *
 * @example
 * all([ok(1), ok(2), ok(3)]);       // Ok([1, 2, 3])
 * all([ok(1), err("x"), ok(3)]);    // Err("x")
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
