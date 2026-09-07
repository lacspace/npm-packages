/**
 * @lacspace/validate
 * A tiny, typed schema validator — the ergonomics of zod in a zero-dependency,
 * isomorphic package small enough to drop anywhere.
 *
 * ```ts
 * import { v, type Infer } from "@lacspace/validate";
 *
 * const User = v.object({
 *   name: v.string().min(2),
 *   email: v.string().email(),
 *   age: v.coerce.number().int().min(0).optional(),
 *   role: v.enum(["admin", "user"]).default("user"),
 * });
 *
 * type User = Infer<typeof User>;
 * const parsed = User.parse(input);      // throws ValidationError on bad input
 * const result = User.safeParse(input);  // { success, data | error }
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/* ------------------------------------------------------------------ *
 * Issues & errors
 * ------------------------------------------------------------------ */

export interface Issue {
  /** Location of the problem, e.g. ["address", "zip"] or ["items", 0]. */
  path: (string | number)[];
  /** Human-readable message. */
  message: string;
  /** Machine code, e.g. "too_small", "invalid_type", "invalid_string". */
  code: string;
}

export class ValidationError extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super(issues.map((i) => formatIssue(i)).join("; "));
    this.name = "ValidationError";
    this.issues = issues;
  }
  /** `{ "address.zip": "Required", ... }` — handy for form field errors. */
  flatten(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const i of this.issues) {
      const key = i.path.length ? i.path.join(".") : "_";
      if (!(key in out)) out[key] = i.message;
    }
    return out;
  }
  /**
   * Nested, zod-style error tree that mirrors the input shape, with an
   * `_errors: string[]` array at each node. Great for rendering field errors
   * next to nested inputs.
   *
   * ```ts
   * err.format();
   * // { _errors: [], address: { _errors: [], zip: { _errors: ["Required"] } } }
   * ```
   */
  format(): FormattedError {
    const root: FormattedError = { _errors: [] };
    for (const i of this.issues) {
      // Never build nodes for __proto__/constructor/prototype (prototype-pollution).
      if (i.path.some((p) => isUnsafeKey(String(p)))) {
        root._errors.push(i.message);
        continue;
      }
      let node = root;
      for (const raw of i.path) {
        const key = String(raw);
        let child = node[key] as FormattedError | undefined;
        if (!child || typeof child !== "object" || Array.isArray(child)) {
          child = { _errors: [] };
          node[key] = child;
        }
        node = child;
      }
      node._errors.push(i.message);
    }
    return root;
  }
}

/** Nested error tree returned by {@link ValidationError.format}. */
export type FormattedError = { _errors: string[] } & {
  [key: string]: FormattedError | string[] | undefined;
};

function formatIssue(i: Issue): string {
  return i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message;
}

/* ------------------------------------------------------------------ *
 * Internal parse result
 * ------------------------------------------------------------------ */

type Ctx = { path: (string | number)[] };
type Ok<T> = { ok: true; value: T };
type Fail = { ok: false; issues: Issue[] };
type Internal<T> = Ok<T> | Fail;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const fail = (ctx: Ctx, message: string, code: string): Fail => ({
  ok: false,
  issues: [{ path: [...ctx.path], message, code }],
});

/* ------------------------------------------------------------------ *
 * Public result
 * ------------------------------------------------------------------ */

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

/* ------------------------------------------------------------------ *
 * Base schema
 * ------------------------------------------------------------------ */

type Check<T> = (value: T, ctx: Ctx) => Issue[] | void;

export abstract class Schema<T> {
  /** @internal */
  abstract _parse(input: unknown, ctx: Ctx): Internal<T>;

  parse(input: unknown): T {
    const r = this._parse(input, { path: [] });
    if (r.ok) return r.value;
    throw new ValidationError(r.issues);
  }

  safeParse(input: unknown): SafeParseResult<T> {
    const r = this._parse(input, { path: [] });
    return r.ok
      ? { success: true, data: r.value }
      : { success: false, error: new ValidationError(r.issues) };
  }

  /** Returns `true` if the input matches (also a TS type guard). */
  is(input: unknown): input is T {
    return this._parse(input, { path: [] }).ok;
  }

  optional(): Schema<T | undefined> {
    return new OptionalSchema(this);
  }
  nullable(): Schema<T | null> {
    return new NullableSchema(this);
  }
  nullish(): Schema<T | null | undefined> {
    return new NullableSchema(new OptionalSchema(this)) as Schema<T | null | undefined>;
  }
  default(value: T | (() => T)): Schema<T> {
    return new DefaultSchema(this, value);
  }
  /** Custom predicate; fails with `message` when it returns false. */
  refine(check: (value: T) => boolean, message = "Invalid value"): Schema<T> {
    return new RefineSchema(this, check, message);
  }
  /**
   * Full-control refinement: inspect the value and push zero or more issues via
   * `ctx.addIssue({ message, code?, path? })`. `path` is relative to this value.
   */
  superRefine(check: (value: T, ctx: RefinementCtx) => void): Schema<T> {
    return new SuperRefineSchema(this, check);
  }
  /** Map a valid value to another shape after parsing. */
  transform<U>(fn: (value: T) => U): Schema<U> {
    return new TransformSchema(this, fn);
  }
  /** Feed this schema's output into another schema (a validation pipeline). */
  pipe<U>(target: Schema<U>): Schema<U> {
    return new PipeSchema(this, target);
  }
  /** On parse failure, silently substitute `value` instead of throwing/erroring. */
  catch(value: T | (() => T)): Schema<T> {
    return new CatchSchema(this, value);
  }
  /** Nominal typing: tag the inferred type with a unique brand (type-level only). */
  brand<B extends string | symbol = string>(): Schema<T & Brand<B>> {
    return new BrandSchema<T, B>(this);
  }
  /** Intersection: the value must satisfy both this schema and `other`. */
  and<U>(other: Schema<U>): Schema<T & U> {
    return new IntersectionSchema(this, other);
  }
  /** Union: the value must satisfy this schema or `other`. */
  or<U>(other: Schema<U>): Schema<T | U> {
    return new UnionSchema([this, other] as const) as unknown as Schema<T | U>;
  }
}

/** Passed to {@link Schema.superRefine}'s callback. */
export interface RefinementCtx {
  /** The path of the value being refined (relative to the root parse). */
  readonly path: (string | number)[];
  /** Record a problem; `path` (if given) is appended to the current path. */
  addIssue(issue: { message: string; code?: string; path?: (string | number)[] }): void;
}

declare const BRAND: unique symbol;
/** Nominal brand marker used by {@link Schema.brand}. */
export type Brand<B extends string | symbol> = { readonly [BRAND]: B };

/* Wrapper schemas ------------------------------------------------- */

class OptionalSchema<T> extends Schema<T | undefined> {
  constructor(private inner: Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T | undefined> {
    if (input === undefined) return ok(undefined);
    return this.inner._parse(input, ctx);
  }
}

class NullableSchema<T> extends Schema<T | null> {
  constructor(private inner: Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T | null> {
    if (input === null) return ok(null);
    return this.inner._parse(input, ctx);
  }
}

class DefaultSchema<T> extends Schema<T> {
  constructor(private inner: Schema<T>, private value: T | (() => T)) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    if (input === undefined) {
      const v = typeof this.value === "function" ? (this.value as () => T)() : this.value;
      return ok(v);
    }
    return this.inner._parse(input, ctx);
  }
}

class RefineSchema<T> extends Schema<T> {
  constructor(
    private inner: Schema<T>,
    private check: (value: T) => boolean,
    private message: string,
  ) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    const r = this.inner._parse(input, ctx);
    if (!r.ok) return r;
    if (!this.check(r.value)) return fail(ctx, this.message, "custom");
    return r;
  }
}

class TransformSchema<T, U> extends Schema<U> {
  constructor(private inner: Schema<T>, private fn: (value: T) => U) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<U> {
    const r = this.inner._parse(input, ctx);
    if (!r.ok) return r;
    return ok(this.fn(r.value));
  }
}

class SuperRefineSchema<T> extends Schema<T> {
  constructor(private inner: Schema<T>, private fn: (value: T, ctx: RefinementCtx) => void) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    const r = this.inner._parse(input, ctx);
    if (!r.ok) return r;
    const issues: Issue[] = [];
    const rctx: RefinementCtx = {
      path: [...ctx.path],
      addIssue: (i) =>
        issues.push({
          path: i.path ? [...ctx.path, ...i.path] : [...ctx.path],
          message: i.message,
          code: i.code ?? "custom",
        }),
    };
    this.fn(r.value, rctx);
    return issues.length ? { ok: false, issues } : r;
  }
}

class PipeSchema<T, U> extends Schema<U> {
  constructor(private from: Schema<T>, private to: Schema<U>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<U> {
    const r = this.from._parse(input, ctx);
    if (!r.ok) return r;
    return this.to._parse(r.value, ctx);
  }
}

class CatchSchema<T> extends Schema<T> {
  constructor(private inner: Schema<T>, private value: T | (() => T)) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    const r = this.inner._parse(input, ctx);
    if (r.ok) return r;
    return ok(typeof this.value === "function" ? (this.value as () => T)() : this.value);
  }
}

class BrandSchema<T, B extends string | symbol> extends Schema<T & Brand<B>> {
  constructor(private inner: Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T & Brand<B>> {
    return this.inner._parse(input, ctx) as Internal<T & Brand<B>>;
  }
}

/* ------------------------------------------------------------------ *
 * String
 * ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ISO-8601 date-time: date + "T" + time, optional fractional seconds and zone.
const DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$/;
const CUID_RE = /^c[^\s-]{8,}$/i;
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;

export class StringSchema extends Schema<string> {
  private checks: Check<string>[] = [];
  private doTrim = false;
  private caseMode: "lower" | "upper" | null = null;

  _parse(input: unknown, ctx: Ctx): Internal<string> {
    if (typeof input !== "string")
      return fail(ctx, "Expected a string", "invalid_type");
    let value = input;
    if (this.doTrim) value = value.trim();
    if (this.caseMode === "lower") value = value.toLowerCase();
    else if (this.caseMode === "upper") value = value.toUpperCase();
    const issues: Issue[] = [];
    for (const c of this.checks) {
      const r = c(value, ctx);
      if (r) issues.push(...r);
    }
    return issues.length ? { ok: false, issues } : ok(value);
  }

  min(n: number, message?: string): this {
    this.checks.push((v, ctx) =>
      v.length < n ? [issue(ctx, message ?? `Must be at least ${n} characters`, "too_small")] : undefined,
    );
    return this;
  }
  max(n: number, message?: string): this {
    this.checks.push((v, ctx) =>
      v.length > n ? [issue(ctx, message ?? `Must be at most ${n} characters`, "too_big")] : undefined,
    );
    return this;
  }
  length(n: number, message?: string): this {
    this.checks.push((v, ctx) =>
      v.length !== n ? [issue(ctx, message ?? `Must be exactly ${n} characters`, "invalid_length")] : undefined,
    );
    return this;
  }
  nonempty(message = "Required"): this {
    return this.min(1, message);
  }
  email(message = "Invalid email address"): this {
    // Cap length before the regex: an unbounded input can trigger quadratic
    // backtracking (ReDoS). 320 = 64 local-part + 1 "@" + 255 domain (RFC 5321).
    this.checks.push((v, ctx) =>
      v.length <= 320 && EMAIL_RE.test(v) ? undefined : [issue(ctx, message, "invalid_string")],
    );
    return this;
  }
  url(message = "Invalid URL"): this {
    this.checks.push((v, ctx) => {
      try {
        new URL(v);
        return undefined;
      } catch {
        return [issue(ctx, message, "invalid_string")];
      }
    });
    return this;
  }
  uuid(message = "Invalid UUID"): this {
    this.checks.push((v, ctx) => (UUID_RE.test(v) ? undefined : [issue(ctx, message, "invalid_string")]));
    return this;
  }
  regex(re: RegExp, message = "Invalid format"): this {
    this.checks.push((v, ctx) => (re.test(v) ? undefined : [issue(ctx, message, "invalid_string")]));
    return this;
  }
  /** ISO-8601 date-time string, e.g. `2026-09-07T12:30:00.000Z`. */
  datetime(message = "Invalid datetime"): this {
    this.checks.push((v, ctx) => (DATETIME_RE.test(v) ? undefined : [issue(ctx, message, "invalid_string")]));
    return this;
  }
  /** IPv4 or IPv6 address. */
  ip(message = "Invalid IP address"): this {
    this.checks.push((v, ctx) =>
      IPV4_RE.test(v) || IPV6_RE.test(v) ? undefined : [issue(ctx, message, "invalid_string")],
    );
    return this;
  }
  /** CUID (collision-resistant id), e.g. `cjld2cjxh0000qzrmn831i7rn`. */
  cuid(message = "Invalid CUID"): this {
    this.checks.push((v, ctx) => (CUID_RE.test(v) ? undefined : [issue(ctx, message, "invalid_string")]));
    return this;
  }
  startsWith(s: string, message?: string): this {
    this.checks.push((v, ctx) =>
      v.startsWith(s) ? undefined : [issue(ctx, message ?? `Must start with "${s}"`, "invalid_string")],
    );
    return this;
  }
  endsWith(s: string, message?: string): this {
    this.checks.push((v, ctx) =>
      v.endsWith(s) ? undefined : [issue(ctx, message ?? `Must end with "${s}"`, "invalid_string")],
    );
    return this;
  }
  trim(): this {
    this.doTrim = true;
    return this;
  }
  toLowerCase(): this {
    this.caseMode = "lower";
    return this;
  }
  toUpperCase(): this {
    this.caseMode = "upper";
    return this;
  }
}

/* ------------------------------------------------------------------ *
 * Number
 * ------------------------------------------------------------------ */

export class NumberSchema extends Schema<number> {
  private checks: Check<number>[] = [];

  _parse(input: unknown, ctx: Ctx): Internal<number> {
    if (typeof input !== "number" || Number.isNaN(input))
      return fail(ctx, "Expected a number", "invalid_type");
    const issues: Issue[] = [];
    for (const c of this.checks) {
      const r = c(input, ctx);
      if (r) issues.push(...r);
    }
    return issues.length ? { ok: false, issues } : ok(input);
  }

  min(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v < n ? [issue(ctx, message ?? `Must be ≥ ${n}`, "too_small")] : undefined));
    return this;
  }
  max(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v > n ? [issue(ctx, message ?? `Must be ≤ ${n}`, "too_big")] : undefined));
    return this;
  }
  gt(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v > n ? undefined : [issue(ctx, message ?? `Must be > ${n}`, "too_small")]));
    return this;
  }
  lt(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v < n ? undefined : [issue(ctx, message ?? `Must be < ${n}`, "too_big")]));
    return this;
  }
  int(message = "Must be an integer"): this {
    this.checks.push((v, ctx) => (Number.isInteger(v) ? undefined : [issue(ctx, message, "invalid_type")]));
    return this;
  }
  positive(message = "Must be positive"): this {
    return this.gt(0, message);
  }
  negative(message = "Must be negative"): this {
    return this.lt(0, message);
  }
  nonnegative(message = "Must be ≥ 0"): this {
    return this.min(0, message);
  }
  nonpositive(message = "Must be ≤ 0"): this {
    return this.max(0, message);
  }
  finite(message = "Must be finite"): this {
    this.checks.push((v, ctx) => (Number.isFinite(v) ? undefined : [issue(ctx, message, "not_finite")]));
    return this;
  }
  /** Must be a multiple of `n` (float-safe). */
  multipleOf(n: number, message?: string): this {
    this.checks.push((v, ctx) =>
      floatSafeRemainder(v, n) === 0 ? undefined : [issue(ctx, message ?? `Must be a multiple of ${n}`, "not_multiple_of")],
    );
    return this;
  }
  /** Within `Number.MAX_SAFE_INTEGER` range (a safe integer). */
  safe(message = "Must be a safe integer"): this {
    this.checks.push((v, ctx) => (Number.isSafeInteger(v) ? undefined : [issue(ctx, message, "not_finite")]));
    return this;
  }
}

/** Remainder that avoids binary floating-point drift, e.g. 0.3 % 0.1. */
function floatSafeRemainder(value: number, step: number): number {
  const decA = (String(value).split(".")[1] || "").length;
  const decB = (String(step).split(".")[1] || "").length;
  const dec = Math.max(decA, decB);
  const intA = Math.round(value * 10 ** dec);
  const intB = Math.round(step * 10 ** dec);
  return (intA % intB) / 10 ** dec;
}

/* ------------------------------------------------------------------ *
 * BigInt
 * ------------------------------------------------------------------ */

export class BigIntSchema extends Schema<bigint> {
  private checks: Check<bigint>[] = [];

  _parse(input: unknown, ctx: Ctx): Internal<bigint> {
    if (typeof input !== "bigint") return fail(ctx, "Expected a bigint", "invalid_type");
    const issues: Issue[] = [];
    for (const c of this.checks) {
      const r = c(input, ctx);
      if (r) issues.push(...r);
    }
    return issues.length ? { ok: false, issues } : ok(input);
  }

  min(n: bigint, message?: string): this {
    this.checks.push((v, ctx) => (v < n ? [issue(ctx, message ?? `Must be ≥ ${n}`, "too_small")] : undefined));
    return this;
  }
  max(n: bigint, message?: string): this {
    this.checks.push((v, ctx) => (v > n ? [issue(ctx, message ?? `Must be ≤ ${n}`, "too_big")] : undefined));
    return this;
  }
  positive(message = "Must be positive"): this {
    this.checks.push((v, ctx) => (v > 0n ? undefined : [issue(ctx, message, "too_small")]));
    return this;
  }
  negative(message = "Must be negative"): this {
    this.checks.push((v, ctx) => (v < 0n ? undefined : [issue(ctx, message, "too_big")]));
    return this;
  }
  nonnegative(message = "Must be ≥ 0"): this {
    this.checks.push((v, ctx) => (v >= 0n ? undefined : [issue(ctx, message, "too_small")]));
    return this;
  }
}

/* ------------------------------------------------------------------ *
 * Boolean / literal / enum / date
 * ------------------------------------------------------------------ */

export class BooleanSchema extends Schema<boolean> {
  _parse(input: unknown, ctx: Ctx): Internal<boolean> {
    return typeof input === "boolean" ? ok(input) : fail(ctx, "Expected a boolean", "invalid_type");
  }
}

class LiteralSchema<T extends string | number | boolean> extends Schema<T> {
  constructor(private lit: T) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    return input === this.lit ? ok(this.lit) : fail(ctx, `Expected ${JSON.stringify(this.lit)}`, "invalid_literal");
  }
}

class EnumSchema<T extends readonly [string, ...string[]]> extends Schema<T[number]> {
  constructor(private values: T) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T[number]> {
    return typeof input === "string" && (this.values as readonly string[]).includes(input)
      ? ok(input as T[number])
      : fail(ctx, `Expected one of: ${this.values.join(", ")}`, "invalid_enum_value");
  }
  get options(): T {
    return this.values;
  }
}

class DateSchema extends Schema<Date> {
  _parse(input: unknown, ctx: Ctx): Internal<Date> {
    if (input instanceof Date && !Number.isNaN(input.getTime())) return ok(input);
    if (typeof input === "string" || typeof input === "number") {
      const d = new Date(input);
      if (!Number.isNaN(d.getTime())) return ok(d);
    }
    return fail(ctx, "Expected a valid date", "invalid_date");
  }
}

/* ------------------------------------------------------------------ *
 * Object
 * ------------------------------------------------------------------ */

type Shape = Record<string, Schema<unknown>>;
type InferShape<S extends Shape> = Flatten<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>;
type RequiredKeys<S extends Shape> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? never : K;
}[keyof S];
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? K : never;
}[keyof S];
type Flatten<T> = { [K in keyof T]: T[K] } & {};

export class ObjectSchema<S extends Shape> extends Schema<InferShape<S>> {
  private mode: "strip" | "strict" | "passthrough" = "strip";
  constructor(private shape: S) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<InferShape<S>> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return fail(ctx, "Expected an object", "invalid_type");
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const issues: Issue[] = [];
    for (const key of Object.keys(this.shape)) {
      const schema = this.shape[key]!;
      const r = schema._parse(src[key], { path: [...ctx.path, key] });
      if (r.ok) {
        if (r.value !== undefined || key in src) out[key] = r.value;
      } else {
        issues.push(...r.issues);
      }
    }
    if (this.mode !== "strip") {
      for (const key of Object.keys(src)) {
        if (key in this.shape) continue;
        if (this.mode === "strict") {
          issues.push(issue({ path: [...ctx.path, key] }, "Unexpected key", "unrecognized_key"));
        } else if (!isUnsafeKey(key)) {
          out[key] = src[key]; // passthrough, but never pollute the prototype
        }
      }
    }
    return issues.length ? { ok: false, issues } : ok(out as InferShape<S>);
  }
  /** Reject unknown keys. */
  strict(): this {
    this.mode = "strict";
    return this;
  }
  /** Keep unknown keys. */
  passthrough(): this {
    this.mode = "passthrough";
    return this;
  }
  /** Make every field optional (a shallow `Partial`). */
  partial(): ObjectSchema<{ [K in keyof S]: Schema<Infer<S[K]> | undefined> }> {
    const next: Shape = {};
    for (const key of Object.keys(this.shape)) next[key] = this.shape[key]!.optional();
    return new ObjectSchema(next as { [K in keyof S]: Schema<Infer<S[K]> | undefined> });
  }
  /** The raw field schemas, e.g. to reuse one field elsewhere. */
  get fields(): S {
    return this.shape;
  }
}

/* ------------------------------------------------------------------ *
 * Array / union / record
 * ------------------------------------------------------------------ */

class ArraySchema<T> extends Schema<T[]> {
  private checks: Check<T[]>[] = [];
  constructor(private element: Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T[]> {
    if (!Array.isArray(input)) return fail(ctx, "Expected an array", "invalid_type");
    const out: T[] = [];
    const issues: Issue[] = [];
    input.forEach((item, i) => {
      const r = this.element._parse(item, { path: [...ctx.path, i] });
      if (r.ok) out.push(r.value);
      else issues.push(...r.issues);
    });
    if (!issues.length) for (const c of this.checks) {
      const r = c(out, ctx);
      if (r) issues.push(...r);
    }
    return issues.length ? { ok: false, issues } : ok(out);
  }
  min(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v.length < n ? [issue(ctx, message ?? `Must have at least ${n} items`, "too_small")] : undefined));
    return this;
  }
  max(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v.length > n ? [issue(ctx, message ?? `Must have at most ${n} items`, "too_big")] : undefined));
    return this;
  }
  length(n: number, message?: string): this {
    this.checks.push((v, ctx) =>
      v.length !== n ? [issue(ctx, message ?? `Must have exactly ${n} items`, "invalid_length")] : undefined,
    );
    return this;
  }
  nonempty(message = "Must not be empty"): this {
    return this.min(1, message);
  }
}

class UnionSchema<T extends readonly Schema<unknown>[]> extends Schema<Infer<T[number]>> {
  constructor(private options: T) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<Infer<T[number]>> {
    for (const opt of this.options) {
      const r = opt._parse(input, ctx);
      if (r.ok) return r as Internal<Infer<T[number]>>;
    }
    return fail(ctx, "No union member matched", "invalid_union");
  }
}

class RecordSchema<T> extends Schema<Record<string, T>> {
  constructor(private value: Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<Record<string, T>> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return fail(ctx, "Expected an object", "invalid_type");
    const src = input as Record<string, unknown>;
    const out: Record<string, T> = {};
    const issues: Issue[] = [];
    for (const key of Object.keys(src)) {
      if (isUnsafeKey(key)) continue; // prevent prototype pollution
      const r = this.value._parse(src[key], { path: [...ctx.path, key] });
      if (r.ok) out[key] = r.value;
      else issues.push(...r.issues);
    }
    return issues.length ? { ok: false, issues } : ok(out);
  }
}

class AnySchema extends Schema<unknown> {
  _parse(input: unknown): Internal<unknown> {
    return ok(input);
  }
}

class UnknownSchema extends Schema<unknown> {
  _parse(input: unknown): Internal<unknown> {
    return ok(input);
  }
}

class NeverSchema extends Schema<never> {
  _parse(_input: unknown, ctx: Ctx): Internal<never> {
    return fail(ctx, "Expected never", "invalid_type");
  }
}

class VoidSchema extends Schema<void> {
  _parse(input: unknown, ctx: Ctx): Internal<void> {
    return input === undefined ? ok(undefined) : fail(ctx, "Expected void (undefined)", "invalid_type");
  }
}

/* ------------------------------------------------------------------ *
 * Tuple / intersection / discriminated union / lazy / native enum
 * ------------------------------------------------------------------ */

type InferTuple<T extends readonly Schema<unknown>[]> = { [K in keyof T]: Infer<T[K]> };

class TupleSchema<T extends readonly Schema<unknown>[]> extends Schema<InferTuple<T>> {
  constructor(private items: T) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<InferTuple<T>> {
    if (!Array.isArray(input)) return fail(ctx, "Expected a tuple", "invalid_type");
    const issues: Issue[] = [];
    if (input.length !== this.items.length)
      issues.push(issue(ctx, `Expected ${this.items.length} items, received ${input.length}`, "invalid_length"));
    const out: unknown[] = [];
    this.items.forEach((s, i) => {
      const r = s._parse(input[i], { path: [...ctx.path, i] });
      if (r.ok) out[i] = r.value;
      else issues.push(...r.issues);
    });
    return issues.length ? { ok: false, issues } : ok(out as InferTuple<T>);
  }
}

class IntersectionSchema<A, B> extends Schema<A & B> {
  constructor(private a: Schema<A>, private b: Schema<B>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<A & B> {
    const ra = this.a._parse(input, ctx);
    const rb = this.b._parse(input, ctx);
    if (!ra.ok || !rb.ok) {
      const issues = [...(ra.ok ? [] : ra.issues), ...(rb.ok ? [] : rb.issues)];
      return { ok: false, issues };
    }
    const av = ra.value as unknown;
    const bv = rb.value as unknown;
    if (isPlainObject(av) && isPlainObject(bv)) return ok({ ...av, ...bv } as A & B);
    return ok(bv as A & B);
  }
}

class DiscriminatedUnionSchema<T> extends Schema<T> {
  constructor(private key: string, private options: ObjectSchema<Shape>[]) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return fail(ctx, "Expected an object", "invalid_type");
    const disc = (input as Record<string, unknown>)[this.key];
    for (const opt of this.options) {
      const field = opt.fields[this.key];
      if (field && field._parse(disc, { path: [] }).ok) {
        return opt._parse(input, { path: [...ctx.path] }) as Internal<T>;
      }
    }
    return fail(ctx, `Invalid discriminator value for key "${this.key}"`, "invalid_union_discriminator");
  }
}

class LazySchema<T> extends Schema<T> {
  private cached?: Schema<T>;
  constructor(private getter: () => Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    if (!this.cached) this.cached = this.getter();
    return this.cached._parse(input, ctx);
  }
}

class NativeEnumSchema<T extends Record<string, string | number>> extends Schema<T[keyof T]> {
  private values: (string | number)[];
  constructor(enumObj: T) {
    super();
    this.values = getValidEnumValues(enumObj);
  }
  _parse(input: unknown, ctx: Ctx): Internal<T[keyof T]> {
    return (typeof input === "string" || typeof input === "number") && this.values.includes(input)
      ? ok(input as T[keyof T])
      : fail(ctx, `Expected one of: ${this.values.join(", ")}`, "invalid_enum_value");
  }
  get options(): (string | number)[] {
    return this.values;
  }
}

/** Values of a TS/const enum, excluding numeric reverse-mappings. */
function getValidEnumValues(obj: Record<string, unknown>): (string | number)[] {
  const validKeys = Object.keys(obj).filter(
    (k) => typeof (obj as Record<string, unknown>)[obj[k] as string] !== "number",
  );
  return validKeys
    .map((k) => obj[k])
    .filter((val): val is string | number => typeof val === "string" || typeof val === "number");
}

/* ------------------------------------------------------------------ *
 * Map / set / instanceof
 * ------------------------------------------------------------------ */

class MapSchema<K, V> extends Schema<Map<K, V>> {
  constructor(private key: Schema<K>, private value: Schema<V>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<Map<K, V>> {
    if (!(input instanceof Map)) return fail(ctx, "Expected a Map", "invalid_type");
    const out = new Map<K, V>();
    const issues: Issue[] = [];
    let i = 0;
    for (const [k, val] of input) {
      const rk = this.key._parse(k, { path: [...ctx.path, i, "key"] });
      const rv = this.value._parse(val, { path: [...ctx.path, i, "value"] });
      if (rk.ok && rv.ok) out.set(rk.value, rv.value);
      else {
        if (!rk.ok) issues.push(...rk.issues);
        if (!rv.ok) issues.push(...rv.issues);
      }
      i++;
    }
    return issues.length ? { ok: false, issues } : ok(out);
  }
}

class SetSchema<T> extends Schema<Set<T>> {
  private checks: Check<Set<T>>[] = [];
  constructor(private element: Schema<T>) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<Set<T>> {
    if (!(input instanceof Set)) return fail(ctx, "Expected a Set", "invalid_type");
    const out = new Set<T>();
    const issues: Issue[] = [];
    let i = 0;
    for (const item of input) {
      const r = this.element._parse(item, { path: [...ctx.path, i] });
      if (r.ok) out.add(r.value);
      else issues.push(...r.issues);
      i++;
    }
    if (!issues.length)
      for (const c of this.checks) {
        const r = c(out, ctx);
        if (r) issues.push(...r);
      }
    return issues.length ? { ok: false, issues } : ok(out);
  }
  min(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v.size < n ? [issue(ctx, message ?? `Must have at least ${n} items`, "too_small")] : undefined));
    return this;
  }
  max(n: number, message?: string): this {
    this.checks.push((v, ctx) => (v.size > n ? [issue(ctx, message ?? `Must have at most ${n} items`, "too_big")] : undefined));
    return this;
  }
  nonempty(message = "Must not be empty"): this {
    return this.min(1, message);
  }
}

class InstanceofSchema<T> extends Schema<T> {
  constructor(private cls: new (...args: never[]) => T, private label: string) {
    super();
  }
  _parse(input: unknown, ctx: Ctx): Internal<T> {
    return input instanceof this.cls ? ok(input as T) : fail(ctx, `Expected instance of ${this.label}`, "invalid_type");
  }
}

/* ------------------------------------------------------------------ *
 * Coercion (great for FormData / query strings, which are all strings)
 * ------------------------------------------------------------------ */

class CoerceNumberSchema extends NumberSchema {
  override _parse(input: unknown, ctx: Ctx): Internal<number> {
    if (typeof input === "string" && input.trim() !== "") {
      const n = Number(input);
      if (!Number.isNaN(n)) return super._parse(n, ctx);
    }
    if (typeof input === "boolean") return super._parse(input ? 1 : 0, ctx);
    return super._parse(input, ctx);
  }
}

class CoerceBooleanSchema extends BooleanSchema {
  override _parse(input: unknown, ctx: Ctx): Internal<boolean> {
    if (typeof input === "string") {
      const s = input.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(s)) return ok(true);
      if (["false", "0", "no", "off", ""].includes(s)) return ok(false);
    }
    if (typeof input === "number") return ok(input !== 0);
    return super._parse(input, ctx);
  }
}

class CoerceStringSchema extends StringSchema {
  override _parse(input: unknown, ctx: Ctx): Internal<string> {
    if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint")
      return super._parse(String(input), ctx);
    return super._parse(input, ctx);
  }
}

class CoerceDateSchema extends DateSchema {
  override _parse(input: unknown, ctx: Ctx): Internal<Date> {
    if (typeof input === "bigint") return super._parse(Number(input), ctx);
    return super._parse(input, ctx);
  }
}

class CoerceBigIntSchema extends BigIntSchema {
  override _parse(input: unknown, ctx: Ctx): Internal<bigint> {
    if (typeof input === "number" && Number.isInteger(input)) return super._parse(BigInt(input), ctx);
    if (typeof input === "boolean") return super._parse(input ? 1n : 0n, ctx);
    if (typeof input === "string" && input.trim() !== "") {
      try {
        return super._parse(BigInt(input.trim()), ctx);
      } catch {
        return fail(ctx, "Expected a bigint", "invalid_type");
      }
    }
    return super._parse(input, ctx);
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function issue(ctx: Ctx, message: string, code: string): Issue {
  return { path: [...ctx.path], message, code };
}

/**
 * Keys that must never be copied from untrusted input onto a plain object —
 * assigning them can pollute Object.prototype (prototype-pollution).
 */
function isUnsafeKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/** A non-null, non-array object literal (used when merging intersections). */
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/* ------------------------------------------------------------------ *
 * Public factory (`v`)
 * ------------------------------------------------------------------ */

export const v = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  bigint: () => new BigIntSchema(),
  boolean: () => new BooleanSchema(),
  date: () => new DateSchema(),
  literal: <T extends string | number | boolean>(value: T) => new LiteralSchema(value),
  enum: <T extends readonly [string, ...string[]]>(values: T) => new EnumSchema(values),
  nativeEnum: <T extends Record<string, string | number>>(enumObj: T) => new NativeEnumSchema(enumObj),
  object: <S extends Shape>(shape: S) => new ObjectSchema(shape),
  array: <T>(element: Schema<T>) => new ArraySchema(element),
  tuple: <T extends readonly [Schema<unknown>, ...Schema<unknown>[]]>(items: T) => new TupleSchema(items),
  union: <T extends readonly [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(...options: T) =>
    new UnionSchema(options),
  or: <T extends readonly [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(...options: T) =>
    new UnionSchema(options),
  intersection: <A, B>(a: Schema<A>, b: Schema<B>) => new IntersectionSchema(a, b),
  and: <A, B>(a: Schema<A>, b: Schema<B>) => new IntersectionSchema(a, b),
  discriminatedUnion: <T extends readonly [ObjectSchema<Shape>, ...ObjectSchema<Shape>[]]>(
    key: string,
    options: T,
  ) => new DiscriminatedUnionSchema<Infer<T[number]>>(key, options as unknown as ObjectSchema<Shape>[]),
  record: <T>(value: Schema<T>) => new RecordSchema(value),
  map: <K, V>(key: Schema<K>, value: Schema<V>) => new MapSchema(key, value),
  set: <T>(element: Schema<T>) => new SetSchema(element),
  lazy: <T>(getter: () => Schema<T>) => new LazySchema(getter),
  instanceof: <T>(cls: new (...args: never[]) => T) => new InstanceofSchema<T>(cls, cls.name || "Class"),
  any: () => new AnySchema(),
  unknown: () => new UnknownSchema(),
  never: () => new NeverSchema(),
  void: () => new VoidSchema(),
  /** Coercing variants — parse string/number inputs (FormData, query strings). */
  coerce: {
    string: () => new CoerceStringSchema(),
    number: () => new CoerceNumberSchema(),
    boolean: () => new CoerceBooleanSchema(),
    date: () => new CoerceDateSchema(),
    bigint: () => new CoerceBigIntSchema(),
  },
};

/** Infer the TypeScript type a schema validates. */
export type Infer<S> = S extends Schema<infer T> ? T : never;
