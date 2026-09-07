# lacspace-json

**The friendly `jq`.** A keyless, zero-dependency CLI + typed library to **query, convert, validate, diff, patch and merge** structured data — JSON, YAML, TOML, CSV and NDJSON. Reads from a file, a glob or **stdin**, prints human-pretty by default, exits non-zero on failure so it drops straight into CI.

```bash
echo '{"users":[{"name":"Ada","age":36,"active":true},{"name":"Ivy","age":19,"active":false}]}' \
  | npx lacspace-json query -q '.users[] | select(.age > 21) | .name' -r
# Ada
```

Everything runs locally. No API key, no account, no network, no telemetry — your data never leaves your machine.

### New in 0.2.0

- **JSONPath** (`$`-style) alongside the jq engine — `$.store.book[*].price`, recursive `$..author`, wildcards, unions, slices and filters `$..book[?(@.price<10)]`.
- **RFC 6902 JSON Patch** — apply a patch (`json patch doc.json patch.json`) or **generate** one from two docs (`json diff a.json b.json --patch`). API: `patch`, `diffPatch`.
- **RFC 6901 JSON Pointer** — resolve `/a/b/0` from CLI (`--pointer`) or lib (`pointer`, `hasPointer`, `buildPointer`).
- **flatten / unflatten** — collapse to a `{ "a.b[0]": v }` map and back, round-trip safe, custom `--delimiter`.
- **canonicalize / sort-keys** — `json sort` deep-sorts keys; `--canonical` emits stable minimal-whitespace JSON for hashing and reproducible diffs.
- Still **zero runtime dependencies**, and the core stays **browser-safe** (no Node built-ins) so it runs in the hosted playground too.

## Why it exists

`jq` is brilliant but its language is a cliff, and it only speaks JSON. `lacspace-json` gives you the 80% of jq you actually use every day — paths, `select`, `map`, `sort_by`, `group_by`, aggregates — plus first-class **format conversion**, **JSON Schema validation**, **structural diff** and **deep merge**, all behind one small binary with **zero runtime dependencies**. The query engine is a hand-written tokenizer → evaluator: **no `eval`**, and object building is guarded against prototype pollution.

## Install

```bash
# one-off, no install
npx lacspace-json data.json -q ".users[].email"

# or globally
npm i -g lacspace-json

# or as a library
npm i lacspace-json
```

## CLI

```
lacspace-json <command> [input] [flags]
cat data.json | lacspace-json <command> [flags]
```

| Command | Purpose |
| --- | --- |
| `query` / `get` | Run a jq-style **or** JSONPath (`$…`) query (default when `-q`/`--get` is given) |
| `convert` | JSON ⇄ YAML ⇄ TOML ⇄ CSV ⇄ NDJSON |
| `validate` | Validate a document against a JSON Schema (draft-07 subset) |
| `diff` | Structural diff of two documents (`--patch` emits an RFC 6902 JSON Patch) |
| `patch` | Apply an RFC 6902 JSON Patch: `patch <doc> <patch.json>` |
| `merge` | Deep-merge N documents |
| `flatten` | Collapse to a flat `{ "a.b[0]": v }` map |
| `unflatten` | Rebuild nesting from a flat map |
| `sort` | Deep-sort object keys (`--canonical` emits canonical JSON) |
| `format` | Pretty-print / minify (the default when only an input is given) |

| Flag | Description |
| --- | --- |
| `--from <fmt>` | Input format override: `json` \| `yaml` \| `toml` \| `csv` \| `ndjson` (else auto-detected) |
| `--to <fmt>` | Output format (for `convert`, and `merge`/`format`/`sort`) |
| `-q, --query <expr>` | Query expression — jq-style or JSONPath (see the language below) |
| `--get <path>` | Shorthand: extract a single value at `.a.b[0]` |
| `-p, --pointer <ptr>` | Resolve an RFC 6901 JSON Pointer (`/a/b/0`) |
| `--schema <file>` | JSON Schema file (for `validate`) |
| `--patch` | `diff`: emit an RFC 6902 JSON Patch instead of a report |
| `--indent <n>` | Indent width for pretty JSON/YAML (default `2`) |
| `--sort-keys` | Sort object keys recursively |
| `--canonical` | Canonical JSON output (sorted keys, minimal whitespace) |
| `--min` | Minify JSON output |
| `-d, --delimiter <s>` | Key delimiter for `flatten` / `unflatten` (default `.`) |
| `-r, --raw` | Print string scalars unquoted (great for shell pipelines) |
| `--json` | Force machine-readable JSON output (`diff` / `validate`) |
| `--array <mode>` | Merge array strategy: `concat` \| `replace` \| `by-key` |
| `--array-key <k>` | Key field for `--array by-key` |
| `-h, --help` / `-v, --version` | Help / version |

Data goes to **stdout**, messages and errors to **stderr**. Invalid input, a failed validation, or a non-empty diff exits **non-zero**.

## Query language

A small, safe subset of jq — a hand-written tokenizer and evaluator, no `eval`.

```
paths     .users[0].name    .items[].price    .["a key with spaces"]
pipe      .users[] | select(.age > 21) | .name
select    == != > < >= <= , and / or / not, truthiness
funcs     keys values length type has(k) map(.x) unique reverse flatten
          sort_by(.x) group_by(.x) first last min max sum avg add
```

**Unsupported (on purpose):** arithmetic on outputs, string interpolation, object/array construction (`{a: .b}`, `[...]`), `//` alternative, `def`/functions, and `@base64`-style builtins. For those, reach for real `jq`.

### JSONPath (`$…`)

When a query starts with `$`, the JSONPath engine runs instead — handy for recursive descent, which the jq subset skips. Returns the matched values in document order.

```
root/child   $.store.book        $['store']['book']
wildcard      $.store.*           $.store.book[*]
recursive     $..author           $..price          $..[?(@.price<10)]
index/union   $.book[0]           $.book[-1]        $.book[0,2]
slice         $.book[0:2]         $.book[::2]
filter        $.book[?(@.price < 10)]   $.book[?(@.isbn)]
              $.book[?(@.cat == 'fiction' && @.price < 10)]   $..[?(@.n =~ /^a/)]
```

**Unsupported:** script expressions `[(...)]`, functions like `length()`, and parent navigation. Use `jsonPathPaths` to get the RFC 6901 pointer of each match.

## Examples

```bash
# Pull a single value out of nested data (stdin)
echo '{"a":{"b":[10,20,30]}}' | lacspace-json --get '.a.b[1]'
# 20

# Filter + project, unquoted for the shell
lacspace-json query users.json -q '.users[] | select(.active) | .email' -r

# Aggregate
echo '{"orders":[{"total":9},{"total":21},{"total":6}]}' \
  | lacspace-json -q '.orders | map(.total) | sum'
# 36

# Convert a TOML config to YAML
lacspace-json convert config.toml --to yaml

# CSV → pretty JSON (header row becomes object keys)
cat people.csv | lacspace-json convert --from csv --to json

# Validate against a JSON Schema (exit 1 if invalid)
lacspace-json validate user.json --schema user.schema.json

# See exactly what changed between two docs
lacspace-json diff old.yaml new.yaml

# Deep-merge, matching array items by their id
lacspace-json merge base.json patch.json --array by-key --array-key id

# JSONPath: every price in the tree, recursively
echo '{"store":{"book":[{"price":8.95},{"price":22.5}],"bike":{"price":19.95}}}' \
  | lacspace-json -q '$..price'

# Resolve an RFC 6901 JSON Pointer
echo '{"a":{"b":[10,20,30]}}' | lacspace-json --pointer /a/b/2
# 30

# Generate an RFC 6902 patch, then apply it
lacspace-json diff old.json new.json --patch > changes.json
lacspace-json patch old.json changes.json          # == new.json

# Flatten for grep/env-style diffs, then rebuild
lacspace-json flatten config.json                   # { "server.ports[0]": 80, ... }
lacspace-json unflatten flat.json

# Canonical JSON for hashing / reproducible diffs
lacspace-json sort data.json --canonical | shasum
```

Example diff output:

```
◆ lacspace-json diff · 3 changes

  ~ b        2 → 3
  + c        9
  ~ tags[1]  "y" → "z"
```

## Library API

```ts
import { query, convert, validateSchema, diff, merge } from "lacspace-json";
```

| Export | Signature |
| --- | --- |
| `query` | `(data, expr: string) => unknown` — single result, or array if the query streams many |
| `queryAll` | `(data, expr) => unknown[]` — always the full result stream |
| `compileQuery` | `(expr) => (data) => unknown[]` — reusable compiled query |
| `isValidQuery` | `(expr) => boolean` |
| `convert` | `(src, from: Format, to: Format, opts?) => string` |
| `parseFormat` / `stringifyFormat` | `(text, fmt)` / `(value, fmt, opts?)` |
| `detectFormat` / `formatFromExt` | `(src) => Format` / `(filename) => Format \| undefined` |
| `parseYaml` / `stringifyYaml` | YAML subset codec |
| `parseToml` / `stringifyToml` | TOML subset codec |
| `parseCsv` / `stringifyCsv` | CSV ⇄ array-of-objects |
| `parseNdjson` / `stringifyNdjson` | NDJSON ⇄ array |
| `validateSchema` | `(data, schema) => { valid: boolean; errors: { path; message }[] }` |
| `diff` / `isEqual` | `(a, b) => DiffEntry[]` / `(a, b) => boolean` |
| `merge` / `parseArrayStrategy` | `(values[], opts?) => value` |
| `patch` / `diffPatch` | `(doc, ops: JsonPatch) => value` (RFC 6902 apply) · `(a, b) => JsonPatch` (generate) |
| `pointer` / `hasPointer` | `(doc, "/a/b/0") => value` (throws if missing) · non-throwing check (RFC 6901) |
| `parsePointer` / `buildPointer` | pointer string ⇄ token array (escapes `~0`/`~1`) |
| `jsonPath` / `jsonPathPaths` | `(doc, "$…") => value[]` · matched values · their RFC 6901 pointers |
| `isJsonPath` / `isValidJsonPath` | detect a `$…` expr · validate its syntax |
| `flatten` / `unflatten` | `(value, opts?) => {path:value}` ⇄ nested; `opts.delimiter` |
| `canonicalize` / `sortKeys` | canonical JSON string · deep key-sorted copy |
| `formatJson` / `getPath` / `parsePath` | pretty/minify · single-value getter · path tokenizer |

`Format` is `"json" | "yaml" | "toml" | "csv" | "ndjson"`. Types (`JsonValue`, `DiffEntry`, `ValidationResult`, `ArrayStrategy`, `PatchOp`, `JsonPatch`, `FlattenOptions`, …) are exported too. Fully typed, dual ESM + CJS. The whole library is **browser-safe** — no Node built-ins in the engine.

## Limitations (honest)

- **YAML** covers the common cases — block maps/sequences, nesting, plain/quoted scalars, flow `[...]`/`{...}`, `#` comments, and `|`/`>` block scalars. **Not** supported: anchors & aliases (`&`/`*`), tags (`!!type`), multi-document streams, and merge keys (`<<`).
- **TOML** covers keys, tables, arrays-of-tables, dotted keys, inline tables, and the standard scalar types. Date-times are kept as **strings** (no native date typing); multi-line strings (`"""`) aren't parsed.
- **CSV** assumes a header row and flat rows; nested values are JSON-encoded on write.
- **JSON Schema** is a draft-07 **subset** (see `validateSchema`'s doc): local `$ref` only, no `if/then/else`, `dependencies`, or draft-2020 keywords.
- The **query language** is deliberately a subset of jq, and **JSONPath** is a pragmatic subset of Goessner (see above).
- **`diffPatch`** emits element-wise ops for equal-length arrays and otherwise replaces the whole array — always correct, not always minimal.
- **flatten** keeps empty objects/arrays as leaf values so the round-trip stays lossless.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, permissive, Lacspace-branded.

---

Part of the free [Lacspace developer tools](https://developer.lacspace.com/tools). Built keyless, local-first and zero-dependency.
