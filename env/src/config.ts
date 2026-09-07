/**
 * Non-throwing helpers for @lacspace/env — `parseEnv`/`safeParse` (returns a
 * `{ success, data | errors }` result) and `generateEnvExample` (renders a
 * `.env.example` from a schema's metadata). Zero-dependency, isomorphic.
 */

import {
  type CreateEnvOptions,
  type InferEnv,
  type Validator,
  EnvError,
  createEnv,
} from "./index";

export type ParseResult<T> =
  | { success: true; data: T; errors?: undefined; error?: undefined }
  | { success: false; data?: undefined; errors: string[]; error: EnvError };

/**
 * Validate like {@link createEnv} but **never throw** — returns
 * `{ success: true, data }` on success or `{ success: false, errors, error }`
 * (with the aggregated {@link EnvError}) on failure. Ideal for tests and
 * conditional startup paths.
 */
export function parseEnv<S extends Record<string, Validator<unknown>>>(
  schema: S,
  source?: Record<string, string | undefined>,
  options?: CreateEnvOptions,
): ParseResult<InferEnv<S>> {
  try {
    return { success: true, data: createEnv(schema, source, options) };
  } catch (e) {
    const error =
      e instanceof EnvError
        ? e
        : new EnvError((e as Error).message, [(e as Error).message]);
    return { success: false, errors: error.issues, error };
  }
}

/** Alias of {@link parseEnv}. */
export const safeParse = parseEnv;

/**
 * Render a `.env.example` file body from a schema, using each variable's
 * `.describe()` / `.example()` metadata, its type, its default, and whether it is
 * required or optional. Values of secret-looking variables are left blank.
 * @example
 * import { writeFileSync } from "node:fs";
 * writeFileSync(".env.example", generateEnvExample(schema, { header: "App configuration" }));
 */
export function generateEnvExample<S extends Record<string, Validator<unknown>>>(
  schema: S,
  opts?: { header?: string },
): string {
  const lines: string[] = [];
  if (opts?.header) {
    for (const l of opts.header.split("\n")) lines.push(`# ${l}`);
    lines.push("");
  }
  for (const key of Object.keys(schema)) {
    const meta = schema[key]!.meta ?? {};
    if (meta.description) lines.push(`# ${meta.description}`);
    const required = meta.optional || meta.default !== undefined ? "optional" : "required";
    const note = [meta.type, required].filter(Boolean).join(", ");
    if (note) lines.push(`# (${note})`);
    const value =
      meta.example ?? (meta.default !== undefined ? String(meta.default) : "");
    lines.push(`${key}=${value}`, "");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}
