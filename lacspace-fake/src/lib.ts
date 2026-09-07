/**
 * lacspace-fake — a keyless, zero-dependency, deterministic fake / seed data
 * generator. Describe a schema, get N realistic rows out as JSON, NDJSON, CSV
 * or SQL `INSERT` statements. Reproducible with `--seed`, and Nepal-aware
 * (`locale: "ne"`).
 *
 * ```ts
 * import { parseFields, generateRows, formatRows } from "lacspace-fake";
 *
 * const fields = parseFields("id:autoincrement,name:fullName,email:email,age:int(18..65)");
 * const rows = generateRows(fields, { count: 3, seed: 42 });
 * formatRows(rows, { format: "sql", table: "users" });
 * // INSERT INTO "users" ("id", "name", "email", "age") VALUES
 * //   (1, 'Grace Davis', 'grace.davis@gmail.com', 27), ...
 *
 * // one generator, N values:
 * import { generateValues } from "lacspace-fake";
 * generateValues("email", { count: 5, seed: 1 });
 * ```
 *
 * Every value is drawn from a seeded mulberry32 PRNG, so the same seed produces
 * byte-identical output on every machine — ideal for test fixtures and repeatable
 * database seeding. No network, no API keys, no telemetry.
 */

export { RNG, hashSeed, normalizeSeed } from "./prng.js";

export { LOCALES, isLocale } from "./data.js";
export type { Locale, LocaleData } from "./data.js";

export { generators, callGen, hasGen, slugify, GEN_ORDER } from "./generators.js";
export type { GenContext, GenArg, Generator } from "./generators.js";

export {
  parseFields,
  parseJsonSchema,
  parseArgString,
  specFromString,
  specFromJson,
  generateRows,
  generateValues,
} from "./schema.js";
export type { Field, Spec, GenerateOptions } from "./schema.js";

export {
  formatRows,
  formatValues,
  toCsv,
  toSql,
  sqlValue,
  sqlIdent,
  columnsOf,
  isFormat,
} from "./format.js";
export type { Format, FormatOptions } from "./format.js";
