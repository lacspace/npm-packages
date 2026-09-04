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
}

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
  /** Map a valid value to another shape after parsing. */
  transform<U>(fn: (value: T) => U): Schema<U> {
    return new TransformSchema(this, fn);
  }
}

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

/* ------------------------------------------------------------------ *
 * String
 * ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  nonnegative(message = "Must be ≥ 0"): this {
    return this.min(0, message);
  }
  finite(message = "Must be finite"): this {
    this.checks.push((v, ctx) => (Number.isFinite(v) ? undefined : [issue(ctx, message, "not_finite")]));
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

/* ------------------------------------------------------------------ *
 * Public factory (`v`)
 * ------------------------------------------------------------------ */

export const v = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  date: () => new DateSchema(),
  literal: <T extends string | number | boolean>(value: T) => new LiteralSchema(value),
  enum: <T extends readonly [string, ...string[]]>(values: T) => new EnumSchema(values),
  object: <S extends Shape>(shape: S) => new ObjectSchema(shape),
  array: <T>(element: Schema<T>) => new ArraySchema(element),
  union: <T extends readonly [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]]>(...options: T) =>
    new UnionSchema(options),
  record: <T>(value: Schema<T>) => new RecordSchema(value),
  any: () => new AnySchema(),
  /** Coercing variants — parse string/number inputs (FormData, query strings). */
  coerce: {
    string: () => new CoerceStringSchema(),
    number: () => new CoerceNumberSchema(),
    boolean: () => new CoerceBooleanSchema(),
  },
};

/** Infer the TypeScript type a schema validates. */
export type Infer<S> = S extends Schema<infer T> ? T : never;
