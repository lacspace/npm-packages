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

export interface Validator<T> {
  parse(raw: string | undefined, key: string): T;
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

interface BaseOpts<T> {
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

/** A string. `allowEmpty` keeps ""; otherwise empty is treated as missing. */
export function str(opts?: BaseOpts<string> & { allowEmpty?: boolean }): Validator<string> {
  return {
    parse(raw, key) {
      if (opts?.allowEmpty && raw === "") return "";
      return withDefault(raw, key, opts, (v) => v);
    },
  };
}

/** A number (integer or float). */
export function num(opts?: BaseOpts<number> & { min?: number; max?: number }): Validator<number> {
  return {
    parse(raw, key) {
      return withDefault(raw, key, opts, (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) fail(key, `must be a number, got "${v}"`);
        if (opts?.min !== undefined && n < opts.min) fail(key, `must be >= ${opts.min}`);
        if (opts?.max !== undefined && n > opts.max) fail(key, `must be <= ${opts.max}`);
        return n;
      });
    },
  };
}

/** An integer. */
export function int(opts?: BaseOpts<number> & { min?: number; max?: number }): Validator<number> {
  const base = num(opts);
  return {
    parse(raw, key) {
      const n = base.parse(raw, key);
      if (n !== undefined && !Number.isInteger(n)) fail(key, `must be an integer, got "${raw}"`);
      return n;
    },
  };
}

/** A TCP port (1–65535). */
export function port(opts?: BaseOpts<number>): Validator<number> {
  return int({ ...opts, min: 1, max: 65535 });
}

/** A boolean. Accepts true/1/yes/on and false/0/no/off (case-insensitive). */
export function bool(opts?: BaseOpts<boolean>): Validator<boolean> {
  return {
    parse(raw, key) {
      return withDefault(raw, key, opts, (v) => {
        const s = v.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(s)) return true;
        if (["false", "0", "no", "off"].includes(s)) return false;
        fail(key, `must be a boolean, got "${v}"`);
      });
    },
  };
}

/** A valid URL string. */
export function url(opts?: BaseOpts<string>): Validator<string> {
  return {
    parse(raw, key) {
      return withDefault(raw, key, opts, (v) => {
        try {
          new URL(v);
        } catch {
          fail(key, `must be a valid URL, got "${v}"`);
        }
        return v;
      });
    },
  };
}

/** A plausible email address. */
export function email(opts?: BaseOpts<string>): Validator<string> {
  return {
    parse(raw, key) {
      return withDefault(raw, key, opts, (v) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(key, `must be an email, got "${v}"`);
        return v;
      });
    },
  };
}

/** One of a fixed set of string values. */
export function oneOf<const T extends string>(
  values: readonly T[],
  opts?: BaseOpts<T>,
): Validator<T> {
  return {
    parse(raw, key) {
      return withDefault(raw, key, opts, (v) => {
        if (!values.includes(v as T)) fail(key, `must be one of ${values.join(", ")}, got "${v}"`);
        return v as T;
      });
    },
  };
}

/** JSON-parsed value. */
export function json<T = unknown>(opts?: BaseOpts<T>): Validator<T> {
  return {
    parse(raw, key) {
      return withDefault(raw, key, opts, (v) => {
        try {
          return JSON.parse(v) as T;
        } catch {
          fail(key, "must be valid JSON");
        }
      });
    },
  };
}

export type InferEnv<S extends Record<string, Validator<unknown>>> = {
  readonly [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

const defaultSource: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? process.env : {};

/**
 * Validate a schema against a source (defaults to `process.env`) and return a
 * typed, frozen object. Throws a single {@link EnvError} listing every problem.
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
): InferEnv<S> {
  const out: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const key of Object.keys(schema)) {
    try {
      out[key] = schema[key]!.parse(source[key], key);
    } catch (e) {
      issues.push(`  • ${(e as Error).message}`);
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
