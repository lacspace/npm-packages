# lacspace-schema

**Infer a JSON Schema from data, generate TypeScript types from JSON _or_ a schema, and build realistic examples from a schema** — all keyless, offline, and with **zero runtime dependencies**. It closes the loop with [`lacspace-json`](https://developer.lacspace.com/tools/json) (validate) and [`lacspace-fake`](https://developer.lacspace.com/tools/fake) (data).

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

`InferOptions`: `{ enumThreshold?, required?: "detected" | "all" | "none", collectExamples?, title?, declareDraft? }`
`TsOptions`: `{ name?, readonly?, jsdoc?, enum?, indent?, exported? }`
`ExampleOptions`: `{ includeOptional?, useExamples? }`

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
| `--name <RootName>` | infer, types | Name for the root type / schema title (default `Root`) |
| `--from json\|schema` | types | Force how the input is read (default: auto-detect) |
| `--enum-threshold <n>` | infer, types | Detect enums with ≤ n distinct values (`0` = off, the default) |
| `--no-required` | infer, types | Mark every inferred property optional |
| `--all-required` | infer, types | Mark every inferred property required |
| `--readonly` | types | Emit `readonly` properties |
| `--jsdoc` | types | Add example values as JSDoc comments |
| `--enum` | types | Emit real TS `enum`s for string enums |
| `--required-only` | example | Include only required properties |
| `--title <str>` | infer | Set the schema `title` |
| `--indent <n>` | all | Indent width for JSON/TS output (default 2) |
| `--json` | diff | Machine-readable JSON output |
| `-h, --help` / `-v, --version` | — | Help / version |

Respects `NO_COLOR`. Data goes to **stdout**, messages to **stderr**, and the process exits non-zero on failure (and `2` on a breaking diff) so it works in CI.

## Detected string formats

`date-time`, `date`, `email`, `uri`, `uuid`, `ipv4` — a `format` is only added when **every** sample matches it.

## Limitations

- Inference describes the **samples you give it** — feed representative data for a representative schema. Enum detection is off by default (`--enum-threshold 0`); turn it on deliberately, since it will beat `format` detection for low-cardinality string fields.
- `$ref` resolution covers **local** `#/definitions` and `#/$defs` pointers only (no remote/URL refs).
- The example generator aims for a minimal valid instance, not fuzzed or exhaustive data (use `lacspace-fake` for volume).
- `diff` is a structural property/type/required/enum diff — it does not evaluate numeric-range or pattern tightening as breaking.

## Licence

Lacspace Free Licence v1.0 — see [`LICENSE`](./LICENSE).
