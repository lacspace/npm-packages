# lacspace-json

**The friendly `jq`.** A keyless, zero-dependency CLI + typed library to **query, convert, validate, diff and merge** structured data — JSON, YAML, TOML, CSV and NDJSON. Reads from a file, a glob or **stdin**, prints human-pretty by default, exits non-zero on failure so it drops straight into CI.

```bash
echo '{"users":[{"name":"Ada","age":36,"active":true},{"name":"Ivy","age":19,"active":false}]}' \
  | npx lacspace-json query -q '.users[] | select(.age > 21) | .name' -r
# Ada
```

Everything runs locally. No API key, no account, no network, no telemetry — your data never leaves your machine.

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
| `query` / `get` | Run a jq-style query (default when `-q`/`--get` is given) |
| `convert` | JSON ⇄ YAML ⇄ TOML ⇄ CSV ⇄ NDJSON |
| `validate` | Validate a document against a JSON Schema (draft-07 subset) |
| `diff` | Structural diff of two documents |
| `merge` | Deep-merge N documents |
| `format` | Pretty-print / minify (the default when only an input is given) |

| Flag | Description |
| --- | --- |
| `--from <fmt>` | Input format override: `json` \| `yaml` \| `toml` \| `csv` \| `ndjson` (else auto-detected) |
| `--to <fmt>` | Output format (for `convert`, and `merge`/`format`) |
| `-q, --query <expr>` | Query expression (see the language below) |
| `--get <path>` | Shorthand: extract a single value at `.a.b[0]` |
| `--schema <file>` | JSON Schema file (for `validate`) |
| `--indent <n>` | Indent width for pretty JSON/YAML (default `2`) |
| `--sort-keys` | Sort object keys recursively |
| `--min` | Minify JSON output |
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

**Unsupported (on purpose):** arithmetic on outputs, string interpolation, object/array construction (`{a: .b}`, `[...]`), `//` alternative, `..` recursive descent, `def`/functions, and `@base64`-style builtins. For those, reach for real `jq`.

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
| `formatJson` / `getPath` / `parsePath` | pretty/minify · single-value getter · path tokenizer |

`Format` is `"json" | "yaml" | "toml" | "csv" | "ndjson"`. Types (`JsonValue`, `DiffEntry`, `ValidationResult`, `ArrayStrategy`, …) are exported too. Fully typed, dual ESM + CJS.

## Limitations (honest)

- **YAML** covers the common cases — block maps/sequences, nesting, plain/quoted scalars, flow `[...]`/`{...}`, `#` comments, and `|`/`>` block scalars. **Not** supported: anchors & aliases (`&`/`*`), tags (`!!type`), multi-document streams, and merge keys (`<<`).
- **TOML** covers keys, tables, arrays-of-tables, dotted keys, inline tables, and the standard scalar types. Date-times are kept as **strings** (no native date typing); multi-line strings (`"""`) aren't parsed.
- **CSV** assumes a header row and flat rows; nested values are JSON-encoded on write.
- **JSON Schema** is a draft-07 **subset** (see `validateSchema`'s doc): local `$ref` only, no `if/then/else`, `dependencies`, or draft-2020 keywords.
- The **query language** is deliberately a subset of jq (see above).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, permissive, Lacspace-branded.

---

Part of the free [Lacspace developer tools](https://developer.lacspace.com/tools). Built keyless, local-first and zero-dependency.
