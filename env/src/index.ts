/**
 * @lacspace/env
 * Typed, validated environment variables — fail fast at boot.
 *
 * Declare a schema, validate `process.env` once at startup, and get a typed,
 * frozen object back. Missing or malformed variables throw a single, clear
 * error listing everything that's wrong — before your app serves traffic.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/** Docs / behaviour metadata attached to a validator via `.describe()`, `.example()`, `.secret()`. */
export interface VarMeta {
  /** The coercer type label (e.g. "port", "duration"). */
  type?: string;
  /** Human description, used by {@link generateEnvExample} and docs. */
  description?: string;
  /** An example value, used by {@link generateEnvExample}. */
  example?: string;
  /** The default value, if the coercer was given one. */
  default?: unknown;
  /** Whether the variable is optional. */
  optional?: boolean;
  /** Marks the value as secret so it is redacted in aggregated error output. */
  secret?: boolean;
}

export interface Validator<T> {
  parse(raw: string | undefined, key: string): T;
  /** Docs / behaviour metadata (populated by `.describe()`, `.example()`, `.secret()`). */
  meta?: VarMeta;
  /** Attach a human description (used by docs & `.env.example` generation). */
  describe?(description: string): Validator<T>;
  /** Attach an example value (used by `.env.example` generation). */
  example?(example: string | number | boolean): Validator<T>;
  /** Mark this variable as secret so its value is redacted in error output. */
  secret?(): Validator<T>;
}

export class EnvError extends Error {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message);
    this.name = "EnvError";
  }
}

function fail(key: string, msg: string): never {
  throw new Error(`"${key}" ${msg}`);
}

export interface BaseOpts<T> {
  default?: T;
  optional?: boolean;
}

function withDefault<T>(
  raw: string | undefined,
  key: string,
  opts: BaseOpts<T> | undefined,
  cast: (v: string) => T,
): T {
  if (raw === undefined || raw === "") {
    if (opts && "default" in opts && opts.default !== undefined) return opts.default;
    if (opts?.optional) return undefined as unknown as T;
    fail(key, "is required but was not set");
  }
  return cast(raw);
}

/**
 * Wrap a `parse` function into a full {@link Validator}, adding the chainable
 * `.describe()` / `.example()` / `.secret()` docs helpers. Internal, but the
 * shape it produces is what every coercer returns.
 */
function described<T>(
  parse: (raw: string | undefined, key: string) => T,
  meta: VarMeta = {},
): Validator<T> {
  return {
    parse,
    meta,
    describe: (description: string) => described(parse, { ...meta, description }),
    example: (example: string | number | boolean) =>
      described(parse, { ...meta, example: String(example) }),
    secret: () => described(parse, { ...meta, secret: true }),
  };
}

/** A string. `allowEmpty` keeps ""; otherwise empty is treated as missing. */
export function str(opts?: BaseOpts<string> & { allowEmpty?: boolean }): Validator<string> {
  return described(
    (raw, key) => {
      if (opts?.allowEmpty && raw === "") return "";
      return withDefault(raw, key, opts, (v) => v);
    },
    { type: "string", default: opts?.default, optional: opts?.optional },
  );
}

/** A number (integer or float). */
export function num(opts?: BaseOpts<number> & { min?: number; max?: number }): Validator<number> {
  return described(
    (raw, key) =>
      withDefault(raw, key, opts, (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) fail(key, `must be a number, got "${v}"`);
        if (opts?.min !== undefined && n < opts.min) fail(key, `must be >= ${opts.min}`);
        if (opts?.max !== undefined && n > opts.max) fail(key, `must be <= ${opts.max}`);
        return n;
      }),
    { type: "number", default: opts?.default, optional: opts?.optional },
  );
}

/** An integer. */
export function int(opts?: BaseOpts<number> & { min?: number; max?: number }): Validator<number> {
  const base = num(opts);
  return described(
    (raw, key) => {
      const n = base.parse(raw, key);
      if (n !== undefined && !Number.isInteger(n)) fail(key, `must be an integer, got "${raw}"`);
      return n;
    },
    { type: "integer", default: opts?.default, optional: opts?.optional },
  );
}

/** A TCP port (1–65535). */
export function port(opts?: BaseOpts<number>): Validator<number> {
  const v = int({ ...opts, min: 1, max: 65535 });
  return described(v.parse, { ...v.meta, type: "port" });
}

/** A boolean. Accepts true/1/yes/on and false/0/no/off (case-insensitive). */
export function bool(opts?: BaseOpts<boolean>): Validator<boolean> {
  return described(
    (raw, key) =>
      withDefault(raw, key, opts, (v) => {
        const s = v.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(s)) return true;
        if (["false", "0", "no", "off"].includes(s)) return false;
        fail(key, `must be a boolean, got "${v}"`);
      }),
    { type: "boolean", default: opts?.default, optional: opts?.optional },
  );
}

/** A valid URL string. */
export function url(opts?: BaseOpts<string>): Validator<string> {
  return described(
    (raw, key) =>
      withDefault(raw, key, opts, (v) => {
        try {
          new URL(v);
        } catch {
          fail(key, `must be a valid URL, got "${v}"`);
        }
        return v;
      }),
    { type: "url", default: opts?.default, optional: opts?.optional },
  );
}

/** A plausible email address. */
export function email(opts?: BaseOpts<string>): Validator<string> {
  return described(
    (raw, key) =>
      withDefault(raw, key, opts, (v) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(key, `must be an email, got "${v}"`);
        return v;
      }),
    { type: "email", default: opts?.default, optional: opts?.optional },
  );
}

/** One of a fixed set of string values. */
export function oneOf<const T extends string>(
  values: readonly T[],
  opts?: BaseOpts<T>,
): Validator<T> {
  return described(
    (raw, key) =>
      withDefault(raw, key, opts, (v) => {
        if (!values.includes(v as T)) fail(key, `must be one of ${values.join(", ")}, got "${v}"`);
        return v as T;
      }),
    { type: `enum(${values.join("|")})`, default: opts?.default, optional: opts?.optional },
  );
}

/** JSON-parsed value. */
export function json<T = unknown>(opts?: BaseOpts<T>): Validator<T> {
  return described(
    (raw, key) =>
      withDefault(raw, key, opts, (v) => {
        try {
          return JSON.parse(v) as T;
        } catch {
          fail(key, "must be valid JSON");
        }
      }),
    { type: "json", default: opts?.default, optional: opts?.optional },
  );
}

/**
 * Build a custom validator from a `cast` function that receives an already-present
 * (non-empty) raw string and returns the coerced value. `default`/`optional` are
 * handled for you; throw with {@link raise} for invalid input.
 * @example
 * const level = coerce("loglevel", (v, key) => {
 *   if (!["debug", "info", "warn"].includes(v)) raise(key, `bad level "${v}"`);
 *   return v;
 * }, { default: "info" });
 */
export function coerce<T>(
  type: string,
  cast: (value: string, key: string) => T,
  opts?: BaseOpts<T>,
): Validator<T> {
  return described((raw, key) => withDefault(raw, key, opts, (v) => cast(v, key)), {
    type,
    default: opts?.default,
    optional: opts?.optional,
  });
}

/** Throw a validation error for `key` in the package's standard `"KEY" msg` shape. */
export function raise(key: string, msg: string): never {
  fail(key, msg);
}

export type InferEnv<S extends Record<string, Validator<unknown>>> = {
  readonly [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

const defaultSource: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? process.env : {};

/** Options for {@link createEnv} / {@link parseEnv}. */
export interface CreateEnvOptions {
  /**
   * Expand `${OTHER_VAR}` (and `${OTHER_VAR:-fallback}`) references within values
   * before validation, with cycle detection. Off by default (fully backward compatible).
   */
  expand?: boolean;
}

const SECRET_RE =
  /(SECRET|PASSWORD|PASSWD|PASSPHRASE|PWD|TOKEN|APIKEY|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE|CREDENTIAL|SIGNING|AUTH|SALT|CERT|DSN)/i;

/** Whether a variable name looks like it holds a secret (used to redact error output). */
export function isSecretKey(key: string): boolean {
  return SECRET_RE.test(key);
}

function redact(msg: string, rawValue: string | undefined): string {
  if (rawValue && rawValue.length > 0) return msg.split(rawValue).join("«redacted»");
  return msg;
}

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Expand `${OTHER_VAR}` references within every value of `source`, returning a new
 * object. Supports `${VAR:-fallback}` and detects cyclic references (throws
 * {@link EnvError}). Unresolved references without a fallback expand to "".
 */
export function expandEnv(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const cache = new Map<string, string | undefined>();
  const stack: string[] = [];
  function resolve(key: string): string | undefined {
    if (cache.has(key)) return cache.get(key);
    const raw = source[key];
    if (raw === undefined) return undefined;
    if (stack.includes(key)) {
      const path = [...stack, key].join(" → ");
      throw new EnvError(`Cyclic variable reference: ${path}`, [
        `cyclic variable reference: ${path}`,
      ]);
    }
    stack.push(key);
    const expanded = raw.replace(VAR_RE, (_m, name: string, fallback?: string) => {
      const val = resolve(name);
      if (val !== undefined && val !== "") return val;
      return fallback !== undefined ? fallback : val ?? "";
    });
    stack.pop();
    cache.set(key, expanded);
    return expanded;
  }
  for (const key of Object.keys(source)) out[key] = resolve(key);
  return out;
}

/**
 * Validate a schema against a source (defaults to `process.env`) and return a
 * typed, frozen object. Throws a single {@link EnvError} listing every problem;
 * values of secret-looking variables are redacted in the error output.
 * @example
 * export const env = createEnv({
 *   NODE_ENV: oneOf(["development", "production", "test"], { default: "development" }),
 *   PORT: port({ default: 3000 }),
 *   DATABASE_URL: url(),
 *   DEBUG: bool({ default: false }),
 * });
 */
export function createEnv<S extends Record<string, Validator<unknown>>>(
  schema: S,
  source: Record<string, string | undefined> = defaultSource,
  options?: CreateEnvOptions,
): InferEnv<S> {
  const src = options?.expand ? expandEnv(source) : source;
  const out: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const key of Object.keys(schema)) {
    try {
      out[key] = schema[key]!.parse(src[key], key);
    } catch (e) {
      let msg = (e as Error).message;
      if (isSecretKey(key) || schema[key]!.meta?.secret === true) msg = redact(msg, src[key]);
      issues.push(`  • ${msg}`);
    }
  }
  if (issues.length) {
    throw new EnvError(
      `Invalid environment variables:\n${issues.join("\n")}`,
      issues.map((i) => i.trim().replace(/^• /, "")),
    );
  }
  return Object.freeze(out) as InferEnv<S>;
}

export * from "./coerce";
export * from "./config";
