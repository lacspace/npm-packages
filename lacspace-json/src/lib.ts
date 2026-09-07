/**
 * lacspace-json — the friendly `jq`. A keyless, zero-dependency toolkit to
 * query, convert, validate, diff and merge structured data (JSON / YAML / TOML /
 * CSV / NDJSON). Pure functions, no network, no telemetry.
 *
 * ```ts
 * import { query, convert, validateSchema, diff, merge } from "lacspace-json";
 *
 * const data = { users: [{ name: "Ada", age: 36 }, { name: "Ivy", age: 19 }] };
 *
 * query(data, ".users[] | select(.age > 21) | .name");
 * // "Ada"
 *
 * convert('name = "Ada"\nage = 36', "toml", "json");
 * // '{\n  "name": "Ada",\n  "age": 36\n}\n'
 *
 * validateSchema({ age: 36 }, { type: "object", required: ["age"], properties: { age: { type: "integer", minimum: 0 } } });
 * // { valid: true, errors: [] }
 *
 * diff({ a: 1 }, { a: 2, b: 3 });
 * // [{ kind: "changed", path: "a", before: 1, after: 2 }, { kind: "added", path: "b", after: 3 }]
 *
 * merge([{ a: 1 }, { b: 2 }]);
 * // { a: 1, b: 2 }
 * ```
 *
 * All converters are hand-written subsets — YAML and TOML cover the common cases
 * (maps, arrays, scalars, nesting, flow/inline, block scalars); anchors/aliases,
 * multi-document streams and native date-time typing are intentionally out of
 * scope. See each module's JSDoc for the exact supported grammar.
 */

// --- query ---
export { query, queryAll, compileQuery, isValidQuery } from "./query.js";

// --- convert / codecs ---
export {
  convert,
  parseFormat,
  stringifyFormat,
  detectFormat,
  formatFromExt,
  sanitizeJson,
} from "./convert.js";
export type { Format } from "./convert.js";
export { parseYaml, stringifyYaml } from "./yaml.js";
export { parseToml, stringifyToml } from "./toml.js";
export { parseCsv, stringifyCsv, parseNdjson, stringifyNdjson } from "./csv.js";
export type { CsvParseOptions, CsvStringifyOptions } from "./csv.js";

// --- validate ---
export { validateSchema } from "./schema.js";
export type { ValidationError, ValidationResult } from "./schema.js";

// --- diff / merge ---
export { diff, isEqual } from "./diff.js";
export type { DiffEntry, DiffKind } from "./diff.js";
export { merge, parseArrayStrategy } from "./merge.js";
export type { ArrayStrategy, MergeOptions } from "./merge.js";

// --- JSON Pointer (RFC 6901) ---
export {
  pointer,
  hasPointer,
  parsePointer,
  buildPointer,
  escapePointerToken,
  unescapePointerToken,
} from "./pointer.js";

// --- JSON Patch (RFC 6902) ---
export { patch, diffPatch } from "./patch.js";
export type { PatchOp, JsonPatch } from "./patch.js";

// --- flatten / unflatten ---
export { flatten, unflatten, parseFlatKey } from "./flatten.js";
export type { FlattenOptions } from "./flatten.js";

// --- canonicalize / sort-keys ---
export { canonicalize, sortKeys } from "./canonical.js";

// --- JSONPath ($-style) ---
export {
  jsonPath,
  jsonPathPaths,
  parseJsonPath,
  isJsonPath,
  isValidJsonPath,
} from "./jsonpath.js";

// --- format ---
export { formatJson, getPath, parsePath } from "./format.js";
export type { FormatOptions } from "./format.js";

// --- shared types & utils ---
export {
  deepEqual,
  deepClone,
  typeOf,
  sortKeysDeep,
  compareValues,
  isPlainObject,
  JsonToolError,
} from "./util.js";
export type { JsonValue, JsonObject, JsonPrimitive } from "./util.js";
