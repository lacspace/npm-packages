# lacspace-schema

**Infer a JSON Schema from data, generate TypeScript types _and_ Zod schemas from JSON or a schema, validate data, build realistic examples, and round-trip OpenAPI components** — all keyless, offline, and with **zero runtime dependencies**. It closes the loop with [`lacspace-json`](https://developer.lacspace.com/tools/json) and [`lacspace-fake`](https://developer.lacspace.com/tools/fake).

> **New in 0.2.0**
> - **`validate`** — check a JSON value against a schema; `{ valid, errors[] }` in the library, non-zero exit in CI (`type`, `required`, `enum`, `const`, `format`, `min/max`, `minItems/maxItems`, `additionalProperties`, `pattern`, nullability, `anyOf/oneOf/allOf`, `$ref`).
> - **`zod`** — generate [Zod](https://zod.dev) schema source (`schemaToZod` / `jsonToZod`) with formats, constraints, unions, `$ref` factoring and `z.infer` aliases.
> - **`openapi`** — extract component schemas from an OpenAPI 3 / Swagger 2 doc (`fromOpenApi`) and wrap schemas back into a components block or a full doc (`toOpenApi`).
> - **Broader `$ref`** — local `#/definitions`, `#/$defs` **and** `#/components/schemas` pointers resolve in TS / example / Zod codegen and validation.
> - **Richer inference & examples** — new `time` & `ipv6` formats, and examples that honour enums, formats, `maxLength` and titles.

```bash
echo '{"id":1,"email":"a@x.com","role":"admin"}' | npx lacspace-schema infer
# {
#   "$schema": "http://json-schema.org/draft-07/schema#",
#   "type": "object",
#   "properties": { "id": { "type": "integer" }, "email": { "type": "string", "format": "email" }, ... },
#   "required": ["id", "email", "role"]
# }
```

## Why it exists

Point it at a real API response and get a schema, or at a schema and get types — no accounts, no telemetry, nothing leaves your machine. Pure functions the whole way down, so the same engine powers the CLI, the library, and an in-browser demo.

- **Free & keyless** — no signup, no API key.
- **Zero dependencies** — only Node built-ins; audit it in a minute.
- **Local & private** — reads a file, glob, or stdin; never phones home.
- **Round-trips** — data → schema → types → example, and diff two schemas for breaking changes.

## Install

```bash
# one-off
npx lacspace-schema infer data.json

# or globally
npm i -g lacspace-schema
```

## Commands

### `infer` — data → JSON Schema

Merge one or many samples (a JSON value, a JSON array, NDJSON, or a glob of files) into one draft-07 schema.

```bash
# many samples merge: present-in-all -> required, present-in-some -> optional
printf '{"id":1,"role":"admin"}\n{"id":2,"role":"user","vip":true}\n' \
  | npx lacspace-schema infer --enum-threshold 4
```
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "role": { "type": "string", "enum": ["admin", "user"] },
    "vip": { "type": "boolean" }
  },
  "required": ["id", "role"]
}
```

```bash
# infer across a folder of examples
npx lacspace-schema infer 'fixtures/*.json' --name User --title User
```

### `types` — JSON **or** JSON Schema → TypeScript

Auto-detects whether the input is data or a schema (override with `--from json|schema`).

```bash
echo '{"id":1,"addr":{"city":"KTM"},"tags":["x"]}' \
  | npx lacspace-schema types --name User --jsdoc
```
```ts
export interface Addr {
  /** @example "KTM" */
  city: string;
}

export interface User {
  /** @example 1 */
  id: number;
  addr: Addr;
  tags: string[];
}
```

```bash
# a JSON Schema in, TS enums out, with $ref resolution (cycles safe)
npx lacspace-schema types user.schema.json --from schema --enum --name Account
```

### `example` — schema → sample instance

```bash
npx lacspace-schema example user.schema.json
# a minimal-but-realistic object satisfying required/enum/const/format/min-max
```

### `zod` — JSON **or** JSON Schema → Zod

Same auto-detect as `types` (override with `--from json|schema`). `$ref`s become their own named consts, string `format`s map to `.email()` / `.uuid()` / `.url()` / `.datetime()`, and each const gets a `z.infer` type alias.

```bash
echo '{"id":1,"email":"a@x.com","tags":["x"]}' | npx lacspace-schema zod --name User
```
```ts
import { z } from "zod";

export const User = z.object({
  id: z.number().int(),
  email: z.string().email(),
  tags: z.array(z.string()),
});
export type User = z.infer<typeof User>;
```

### `validate` — data against a schema

```bash
npx lacspace-schema validate user.schema.json user.json
# ✓ valid            (exit 0)
# ✗ /id     [minimum]               less than minimum 1
# ✗ /email  [format]                not a valid email
# ✗ /role   [enum]                  must be one of ["admin","user"]
# ✗ /x      [additionalProperties]  additional property "x" is not allowed   (exit 1)
```
Add `--json` for a machine-readable `{ valid, errors }`. Exits `1` on invalid — drop it into CI to gate a payload against its contract.

### `openapi` — import / export component schemas

```bash
# extract → { name: schema } from an OpenAPI 3 (components.schemas) or Swagger 2 (definitions) doc
npx lacspace-schema openapi api.json

# wrap a schema back into an OpenAPI components block (or a full doc with --full)
echo '{"type":"object","properties":{"id":{"type":"integer"}}}' \
  | npx lacspace-schema openapi --wrap --name Widget
```
The extracted schemas feed straight into `types`, `zod`, `validate` or `example`.

### `diff` — two schemas → breaking-change report

```bash
npx lacspace-schema diff v1.schema.json v2.schema.json
# ✗ BREAKING id     [type-changed]    type integer -> string
# ✗ BREAKING email  [required-added]  became required
# • change   avatar [added]           optional property added
```
Exits `2` when any breaking change is found — drop it into CI to guard an API contract.

## Library API

```ts
import {
  inferSchema, inferNode,
  schemaToTs, jsonToTs,
  schemaToExample,
  diffSchemas,
  validate,                 // 0.2.0
  schemaToZod, jsonToZod,   // 0.2.0
  fromOpenApi, toOpenApi,   // 0.2.0
  resolveRef, refName,      // 0.2.0
  detectFormat, matchesFormat, FORMAT_PATTERNS, // 0.2.0
} from "lacspace-schema";
```

| Function | Signature |
| --- | --- |
| `inferSchema` | `(samples: JsonValue[], opts?: InferOptions) => JSONSchema` |
| `inferNode` | `(values: JsonValue[], opts?: InferOptions) => JSONSchema` |
| `schemaToTs` | `(schema: JSONSchema, opts?: TsOptions) => string` |
| `jsonToTs` | `(samples: JsonValue[], opts?: TsOptions & { enumThreshold?; required? }) => string` |
| `schemaToExample` | `(schema: JSONSchema, opts?: ExampleOptions) => JsonValue` |
| `diffSchemas` | `(before: JSONSchema, after: JSONSchema) => DiffResult` |
| `validate` | `(schema: JSONSchema, data: JsonValue, opts?: ValidateOptions) => ValidationResult` |
| `schemaToZod` | `(schema: JSONSchema, opts?: ZodOptions) => string` |
| `jsonToZod` | `(samples: JsonValue[], opts?: ZodOptions & { enumThreshold?; required? }) => string` |
| `fromOpenApi` | `(doc: JsonValue) => { version, schemas: Record<string, JSONSchema> }` |
| `toOpenApi` | `(schemas: Record<string, JSONSchema>, opts?: ToOpenApiOptions) => JSONSchema` |
| `resolveRef` / `refName` | `(root, ref) => JSONSchema \| null` / `(ref) => string` |

`InferOptions`: `{ enumThreshold?, required?: "detected" | "all" | "none", collectExamples?, title?, declareDraft? }`
`TsOptions`: `{ name?, readonly?, jsdoc?, enum?, indent?, exported? }`
`ExampleOptions`: `{ includeOptional?, useExamples? }`
`ValidationResult`: `{ valid: boolean, errors: { path, keyword, message }[] }`
`ZodOptions`: `{ name?, exported?, includeImport?, includeInfer? }`
`ToOpenApiOptions`: `{ full?, title?, version? }`

```ts
const schema = inferSchema([
  { id: 1, email: "a@x.com", role: "admin" },
  { id: 2, email: "b@x.com", role: "user", nickname: "bee" },
], { enumThreshold: 4 });

jsonToTs([{ id: 1, tags: ["a"] }], { name: "Post" });
// interface Post { id: number; tags: string[]; }

schemaToExample(schema);   // a sample object satisfying the schema
```

## CLI flags

| Flag | Applies to | Purpose |
| --- | --- | --- |
| `--name <RootName>` | infer, types, zod, openapi | Name for the root type / schema / component (default `Root`/`Schema`) |
| `--from json\|schema` | types, zod | Force how the input is read (default: auto-detect) |
| `--enum-threshold <n>` | infer, types, zod | Detect enums with ≤ n distinct values (`0` = off, the default) |
| `--no-required` | infer, types, zod | Mark every inferred property optional |
| `--all-required` | infer, types, zod | Mark every inferred property required |
| `--readonly` | types | Emit `readonly` properties |
| `--jsdoc` | types | Add example values as JSDoc comments |
| `--enum` | types | Emit real TS `enum`s for string enums |
| `--required-only` | example | Include only required properties |
| `--wrap` | openapi | Treat the input as a schema and wrap it into a components block |
| `--full` | openapi | Emit a full minimal OpenAPI 3 document, not just the block |
| `--title <str>` | infer, openapi | Set the schema `title` / `info.title` |
| `--indent <n>` | all | Indent width for JSON/TS output (default 2) |
| `--json` | diff, validate | Machine-readable JSON output |
| `-h, --help` / `-v, --version` | — | Help / version |

Respects `NO_COLOR`. Data goes to **stdout**, messages to **stderr**, and the process exits non-zero on failure (`1` on invalid `validate`, `2` on a breaking diff) so it works in CI.

## Detected string formats

`date-time`, `date`, `time`, `email`, `uri`, `uuid`, `ipv4`, `ipv6` — a `format` is only added when **every** sample matches it.

## Limitations

- Inference describes the **samples you give it** — feed representative data for a representative schema. Enum detection is off by default (`--enum-threshold 0`); turn it on deliberately, since it will beat `format` detection for low-cardinality string fields.
- `$ref` resolution covers **local** JSON pointers — `#/definitions`, `#/$defs` and `#/components/schemas` — only (no remote/URL refs).
- The example generator aims for a minimal valid instance, not fuzzed or exhaustive data (use `lacspace-fake` for volume).
- `diff` is a structural property/type/required/enum diff — it does not evaluate numeric-range or pattern tightening as breaking.

## Licence

Lacspace Free Licence v1.0 — see [`LICENSE`](./LICENSE).
